import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { requestSession, type Role, type Session } from "@/lib/auth";
import { kv, kv1, toObj, type Cmd } from "@/lib/kv";

/**
 * 느티나무 소통게시판 (서버 전용): 권한 검사 · 암호화 · 비밀번호 · 초대 코드 · 횟수 제한 · 감사 기록 · 데이터.
 *
 * 저장 키 (모두 zelkova:board: 로 시작)
 *   user:{id} 계정 JSON · login:{아이디} → id · users (set)
 *   invite:{sha256(코드)} 초대 JSON (72시간 뒤 사라지고, 쓰면 바로 지움)
 *   students (hash: 학생 id → { 이름표(암호문) })
 *   notices (zset: 시각 → 공지 id) · notice:{id} · read:{글 id} (읽은 사람 set)
 *   thread:{학생 id} (zset: 시각 → 글 id) · msg:{id}
 *   memos:{학생 id} (list)
 *   audit:{YYYY-MM-DD} (list: 누가 · 언제 · 무엇을 · 어느 학생/글, 본문은 넣지 않음)
 * 글 본문과 학생 이름은 MESSAGE_ENC_KEY 로 AES-256-GCM 암호화해서 저장함. 지울 때까지 계속 보관함.
 */

const P = "zelkova:board:";

// ---------------------------------------------------------------- 권한

export type BoardRole = "teacher" | "aide" | "sw" | "parent";
/** 관리자(admin)는 특수교사와 같은 권한 */
export const boardRoleOf = (role: Role): BoardRole | null => (role === "admin" ? "teacher" : role === "teacher" || role === "aide" || role === "sw" || role === "parent" ? role : null);

export type BoardSession = Session & { board: BoardRole };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 이 역할 중 하나로 로그인하지 않았으면 401/403 을 던짐. 모든 소통게시판 API 가 맨 처음 부름 */
export function requireRole(request: Request, roles: BoardRole[]): BoardSession {
  const s = requestSession(request);
  const board = s ? boardRoleOf(s.role) : null;
  if (!s || !board) throw new HttpError(401, "로그인이 필요해요.");
  if (!roles.includes(board)) throw new HttpError(403, "이 기능을 쓸 권한이 없어요.");
  return { ...s, board };
}

/** 이 학생의 글을 볼 수 있는지: 교사 · 실무사는 모든 학생, 학부모는 자기 자녀만. 아니면 403 */
export async function requireStudentAccess(s: BoardSession, studentId: string) {
  if (!isId(studentId)) throw new HttpError(400, "학생이 올바르지 않아요.");
  const [raw] = await kv(["HGET", `${P}students`, studentId]);
  if (!raw) throw new HttpError(404, "없는 학생이에요.");
  if (s.board === "teacher" || s.board === "aide" || s.board === "sw") return;
  const user = await getUser(s.userId);
  if (!user?.studentIds.includes(studentId)) throw new HttpError(403, "이 학생의 글을 볼 권한이 없어요.");
}

/** API 처리기 감싸기: 던진 HttpError 는 그 상태 코드로, 다른 오류는 500 으로 */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const body = await run();
    return body instanceof Response ? body : Response.json(body ?? { ok: true }, { headers });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status, headers });
    console.error(e);
    return Response.json({ error: "서버에서 처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers });
  }
}

export const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{6,32}$/.test(v);
export const newId = () => `${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFC").trim().slice(0, max) : "");

// ---------------------------------------------------------------- 암호화 (AES-256-GCM)

let warned = false;
function encKey(): Buffer {
  const raw = process.env.MESSAGE_ENC_KEY?.trim();
  if (raw) {
    for (const enc of ["base64url", "base64", "hex"] as const) {
      const b = Buffer.from(raw, enc);
      if (b.length === 32) return b;
    }
    throw new HttpError(503, "MESSAGE_ENC_KEY 는 32바이트(base64 또는 hex)여야 해요.");
  }
  if (process.env.NODE_ENV === "production") throw new HttpError(503, "서버에 MESSAGE_ENC_KEY 가 아직 설정되지 않았어요.");
  if (!warned) console.warn("MESSAGE_ENC_KEY 가 없어 개발용 키를 씁니다 (배포에서는 반드시 설정).");
  warned = true;
  return createHash("sha256").update(`zelkova-dev:${process.env.AUTH_SECRET ?? ""}`).digest();
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function decrypt(box: string): string {
  const [v, iv, tag, ct] = box.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) return "";
  try {
    const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return "(읽을 수 없는 글)";
  }
}

// ---------------------------------------------------------------- 비밀번호 (scrypt, OWASP 권장 N=2^17 · r=8 · p=1)

const scrypt = (pw: string, salt: Buffer, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, 32, opts, (err, key) => (err ? rej(err) : res(key))));
const PW = { logN: 17, r: 8, p: 1 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFC"), salt, { N: 2 ** PW.logN, r: PW.r, p: PW.p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${PW.logN}$${PW.r}$${PW.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, logN, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const key = await scrypt(pw.normalize("NFC"), Buffer.from(salt, "base64url"), { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 });
  const want = Buffer.from(hash, "base64url");
  return key.length === want.length && timingSafeEqual(key, want);
}

/** 비밀번호를 아무도 맞히지 못할 때도 같은 시간이 걸리게 (아이디가 있는지 알아내지 못하도록) */
let dummy: Promise<string> | null = null;
export const dummyVerify = async (pw: string) => verifyPassword(pw, await (dummy ??= hashPassword("zelkova-dummy")));

// ---------------------------------------------------------------- 횟수 제한 (IP 당 5분에 10번)

export const clientIp = (request: Request) =>
  (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);

export async function rateLimit(request: Request, scope: string, limit = 10, seconds = 300) {
  const key = `zelkova:rl:${scope}:${createHash("sha256").update(clientIp(request)).digest("base64url").slice(0, 22)}`;
  const [n] = (await kv(["INCR", key], ["EXPIRE", key, seconds])) as [number];
  if (Number(n) > limit) throw new HttpError(429, "너무 여러 번 시도했어요. 5분 뒤에 다시 해 주세요.");
}

// ---------------------------------------------------------------- 감사 기록 (본문은 넣지 않음)

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜
export const auditCmd = (s: Pick<Session, "role" | "userId">, action: string, target = ""): Cmd => [
  "LPUSH",
  `${P}audit:${today()}`,
  JSON.stringify({ at: Date.now(), by: s.userId, role: s.role, action, target }),
];
export const audit = (s: Pick<Session, "role" | "userId">, action: string, target = "") => kv(auditCmd(s, action, target));

export async function readAudit(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "날짜가 올바르지 않아요.");
  const rows = (await kv1("LRANGE", `${P}audit:${date}`, 0, 999)) as string[];
  return rows.map((r) => JSON.parse(r) as { at: number; by: string; role: string; action: string; target: string });
}

// ---------------------------------------------------------------- 계정

export type BoardUser = { id: string; role: "aide" | "sw" | "parent"; loginId: string; name: string; pw: string; studentIds: string[]; createdAt: number };
export const ROLE_LABEL: Record<BoardRole, string> = { teacher: "특수교사", aide: "특수교육실무사", sw: "사회복무요원", parent: "학부모" };

export async function getUser(id: string): Promise<BoardUser | null> {
  if (!/^[\w-]{1,40}$/.test(id)) return null;
  const raw = (await kv1("GET", `${P}user:${id}`)) as string | null;
  return raw ? readUser(raw) : null;
}

/** 저장된 계정 (이름은 자녀 이름이 들어갈 수 있어 암호화해 둠) */
const readUser = (raw: string): BoardUser => {
  const u = JSON.parse(raw) as BoardUser;
  return { ...u, name: u.name.startsWith("v1.") ? decrypt(u.name) : u.name };
};
/** 글쓴이 이름도 암호화해서 저장 */
const nameOut = (v: string) => (v.startsWith("v1.") ? decrypt(v) : v);

export async function findLogin(loginId: string): Promise<BoardUser | null> {
  const id = (await kv1("GET", `${P}login:${loginId.toLowerCase()}`)) as string | null;
  return id ? getUser(id) : null;
}

export async function listUsers() {
  const ids = (await kv1("SMEMBERS", `${P}users`)) as string[];
  if (!ids.length) return [];
  const raws = (await kv(...ids.map((id): Cmd => ["GET", `${P}user:${id}`]))) as (string | null)[];
  return raws
    .filter((r): r is string => !!r)
    .map((r) => {
      const { pw: _pw, ...u } = readUser(r); // eslint-disable-line @typescript-eslint/no-unused-vars -- 비밀번호 해시는 내보내지 않음
      return u;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteUser(s: BoardSession, id: string) {
  const user = await getUser(id);
  if (!user) throw new HttpError(404, "없는 계정이에요.");
  await kv(["DEL", `${P}user:${id}`], ["DEL", `${P}login:${user.loginId.toLowerCase()}`], ["SREM", `${P}users`, id], auditCmd(s, "user.delete", id));
}

// ---------------------------------------------------------------- 초대 코드

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 O · 0 · I · 1 은 뺌
const inviteKey = (code: string) => `${P}invite:${createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex")}`;
export type Invite = { role: BoardUser["role"]; studentIds: string[]; issuedBy: string; at: number };

export async function createInvite(s: BoardSession, role: BoardUser["role"], studentIds: string[]) {
  if (role === "parent" && !studentIds.length) throw new HttpError(400, "학부모 초대는 자녀를 골라야 해요.");
  const known = toObj(await kv1("HGETALL", `${P}students`));
  if (studentIds.some((id) => !(id in known))) throw new HttpError(400, "없는 학생이 있어요.");
  const raw = Array.from({ length: 10 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  const invite: Invite = { role, studentIds: role === "parent" ? studentIds : [], issuedBy: s.userId, at: Date.now() };
  await kv(["SET", inviteKey(code), JSON.stringify(invite), "EX", 72 * 3600], auditCmd(s, `invite.create.${role}`));
  return code;
}

/** 초대 코드로 가입. 코드는 쓰자마자 지움 */
export async function redeemInvite(code: string, loginId: string, password: string, name: string): Promise<BoardUser> {
  const raw = (await kv1("GETDEL", inviteKey(code))) as string | null;
  if (!raw) throw new HttpError(400, "초대 코드가 맞지 않거나 이미 쓰였거나 72시간이 지났어요. 선생님께 새 코드를 받아 주세요.");
  const invite = JSON.parse(raw) as Invite;
  const id = newId();
  // 아이디는 한 사람만 (먼저 차지한 사람이 가짐)
  const [taken] = (await kv(["GET", `${P}login:${loginId.toLowerCase()}`])) as [string | null];
  if (taken) {
    await kv(["SET", inviteKey(code), raw, "EX", 72 * 3600]); // 코드는 돌려놓아 다른 아이디로 다시 가입할 수 있게
    throw new HttpError(409, "이미 쓰는 아이디예요. 다른 아이디를 적어 주세요.");
  }
  const user: BoardUser = { id, role: invite.role, loginId, name, pw: await hashPassword(password), studentIds: invite.studentIds, createdAt: Date.now() };
  await kv(
    ["SET", `${P}login:${loginId.toLowerCase()}`, id],
    ["SET", `${P}user:${id}`, JSON.stringify({ ...user, name: encrypt(name) })],
    ["SADD", `${P}users`, id],
    auditCmd({ role: user.role, userId: id }, "user.register"),
  );
  return user;
}

/** 소통게시판 계정 로그인 (맞으면 계정, 아니면 null) */
export async function checkBoardLogin(loginId: string, password: string): Promise<BoardUser | null> {
  const user = await findLogin(loginId);
  if (!user) {
    await dummyVerify(password);
    return null;
  }
  return (await verifyPassword(password, user.pw)) ? user : null;
}

/** 화면에 보일 이름 */
export async function displayName(s: Session): Promise<string> {
  if (s.role === "teacher" || s.role === "admin") return "특수교사";
  const u = await getUser(s.userId);
  return u ? u.name : "알 수 없음";
}

// ---------------------------------------------------------------- 학생 (이름은 암호화)

export type BoardStudent = { id: string; name: string };

export async function listStudents(s: BoardSession): Promise<BoardStudent[]> {
  const all = toObj(await kv1("HGETALL", `${P}students`));
  let ids = Object.keys(all);
  if (s.board === "parent") {
    const u = await getUser(s.userId);
    ids = ids.filter((id) => u?.studentIds.includes(id));
  }
  return ids
    .map((id) => {
      const v = JSON.parse(all[id]) as { name: string; at: number };
      return { id, name: decrypt(v.name), at: v.at };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map(({ id, name }) => ({ id, name }));
}

export async function addStudent(s: BoardSession, name: string) {
  const id = newId();
  await kv(["HSET", `${P}students`, id, JSON.stringify({ name: encrypt(name), at: Date.now() })], auditCmd(s, "student.create", id));
  return { id, name };
}

export async function removeStudent(s: BoardSession, id: string) {
  if (!isId(id)) throw new HttpError(400, "학생이 올바르지 않아요.");
  // 학생과 그 학생의 알림장 · 메모를 모두 지움
  const msgIds = (await kv1("ZREVRANGE", `${P}thread:${id}`, 0, -1)) as string[];
  await kv(
    ["HDEL", `${P}students`, id],
    ["DEL", `${P}thread:${id}`, `${P}memos:${id}`, ...msgIds.flatMap((m) => [`${P}msg:${m}`, `${P}read:${m}`])],
    auditCmd(s, "student.delete", id),
  );
}

// ---------------------------------------------------------------- 학급 공지

type StoredNotice = { id: string; by: string; byName: string; at: number; title: string; body: string };
export type Notice = Omit<StoredNotice, "title" | "body"> & { title: string; body: string; read: boolean; readers?: string[] };

export async function listNotices(s: BoardSession): Promise<Notice[]> {
  const ids = (await kv1("ZREVRANGE", `${P}notices`, 0, 99)) as string[];
  if (!ids.length) return [];
  const res = await kv(...ids.flatMap((id): Cmd[] => [["GET", `${P}notice:${id}`], ["SMEMBERS", `${P}read:${id}`]]));
  const out: Notice[] = [];
  ids.forEach((_, i) => {
    const raw = res[i * 2] as string | null;
    if (!raw) return;
    const n = JSON.parse(raw) as StoredNotice;
    const readers = res[i * 2 + 1] as string[];
    out.push({ ...n, byName: nameOut(n.byName), title: decrypt(n.title), body: decrypt(n.body), read: readers.includes(s.userId), ...(s.board === "teacher" ? { readers } : {}) });
  });
  return out;
}

export async function createNotice(s: BoardSession, title: string, body: string) {
  const id = newId();
  const n: StoredNotice = { id, by: s.userId, byName: encrypt(await displayName(s)), at: Date.now(), title: encrypt(title), body: encrypt(body) };
  await kv(["SET", `${P}notice:${id}`, JSON.stringify(n)], ["ZADD", `${P}notices`, n.at, id], auditCmd(s, "notice.create", id));
  return id;
}

export async function deleteNotice(s: BoardSession, id: string) {
  if (!isId(id)) throw new HttpError(400, "공지가 올바르지 않아요.");
  await kv(["DEL", `${P}notice:${id}`, `${P}read:${id}`], ["ZREM", `${P}notices`, id], auditCmd(s, "notice.delete", id));
}

export async function markNoticeRead(s: BoardSession, id: string) {
  if (!isId(id) || !(await kv1("GET", `${P}notice:${id}`))) throw new HttpError(404, "없는 공지예요.");
  await kv(["SADD", `${P}read:${id}`, s.userId]);
}

// ---------------------------------------------------------------- 학생별 알림장 (교사 → 학부모, 학부모 답글)

/** note: 교사 · 실무사가 쓴 알림장 · reply: 학부모 답글. draft: 실무사가 쓴 초안 (교사가 보내기 전에는 학부모에게 안 보임) */
type StoredMsg = { id: string; studentId: string; kind: "note" | "reply"; status: "sent" | "draft"; by: string; byRole: BoardRole; byName: string; at: number; body: string };
export type Msg = Omit<StoredMsg, "body"> & { body: string; read: boolean; readers?: string[] };

export async function listThread(s: BoardSession, studentId: string): Promise<Msg[]> {
  await requireStudentAccess(s, studentId);
  if (s.board === "sw") throw new HttpError(403, "사회복무요원은 학부모 알림장을 볼 수 없어요.");
  const ids = (await kv1("ZREVRANGE", `${P}thread:${studentId}`, 0, 199)) as string[];
  const res = await kv(...ids.flatMap((id): Cmd[] => [["GET", `${P}msg:${id}`], ["SMEMBERS", `${P}read:${id}`]]), auditCmd(s, "thread.view", studentId));
  const out: Msg[] = [];
  ids.forEach((_, i) => {
    const raw = res[i * 2] as string | null;
    if (!raw) return;
    const m = JSON.parse(raw) as StoredMsg;
    if (s.board === "parent" && m.status !== "sent") return;
    const readers = res[i * 2 + 1] as string[];
    out.push({ ...m, byName: nameOut(m.byName), body: decrypt(m.body), read: readers.includes(s.userId) || m.by === s.userId, ...(s.board === "teacher" ? { readers } : {}) });
  });
  return out.reverse(); // 오래된 것부터
}

export async function postMessage(s: BoardSession, studentId: string, body: string) {
  await requireStudentAccess(s, studentId);
  if (s.board === "sw") throw new HttpError(403, "사회복무요원은 알림장을 쓸 수 없어요. 활동 메모를 남겨 주세요.");
  const m: StoredMsg = {
    id: newId(),
    studentId,
    kind: s.board === "parent" ? "reply" : "note",
    status: s.board === "aide" ? "draft" : "sent",
    by: s.userId,
    byRole: s.board,
    byName: encrypt(await displayName(s)),
    at: Date.now(),
    body: encrypt(body),
  };
  const action = m.kind === "reply" ? "msg.reply" : m.status === "draft" ? "msg.draft" : "msg.send";
  await kv(["SET", `${P}msg:${m.id}`, JSON.stringify(m)], ["ZADD", `${P}thread:${studentId}`, m.at, m.id], auditCmd(s, action, studentId));
  return m.id;
}

async function getMsg(id: string): Promise<StoredMsg> {
  const raw = isId(id) ? ((await kv1("GET", `${P}msg:${id}`)) as string | null) : null;
  if (!raw) throw new HttpError(404, "없는 글이에요.");
  return JSON.parse(raw) as StoredMsg;
}

/** 실무사가 쓴 초안을 교사가 (고쳐서) 보냄 */
export async function approveMessage(s: BoardSession, id: string, body?: string) {
  const m = await getMsg(id);
  if (m.status !== "draft") throw new HttpError(409, "이미 보낸 글이에요.");
  const next: StoredMsg = { ...m, status: "sent", at: Date.now(), body: body ? encrypt(body) : m.body };
  await kv(["SET", `${P}msg:${id}`, JSON.stringify(next)], ["ZADD", `${P}thread:${m.studentId}`, next.at, id], auditCmd(s, "msg.approve", m.studentId));
}

export async function deleteMessage(s: BoardSession, id: string) {
  const m = await getMsg(id);
  await kv(["DEL", `${P}msg:${id}`, `${P}read:${id}`], ["ZREM", `${P}thread:${m.studentId}`, id], auditCmd(s, "msg.delete", m.studentId));
}

export async function markMessagesRead(s: BoardSession, studentId: string, ids: string[]) {
  await requireStudentAccess(s, studentId);
  const valid = ids.filter(isId).slice(0, 200);
  if (valid.length) await kv(...valid.map((id): Cmd => ["SADD", `${P}read:${id}`, s.userId]));
}

// ---------------------------------------------------------------- 활동 메모 (교사 · 실무사 · 사회복무요원이 남김)

type StoredMemo = { id: string; by: string; byRole: BoardRole; byName: string; at: number; date: string; body: string };
export type Memo = Omit<StoredMemo, "body"> & { body: string };

export async function listMemos(s: BoardSession, studentId: string): Promise<Memo[]> {
  await requireStudentAccess(s, studentId);
  if (s.board === "parent") throw new HttpError(403, "활동 메모는 선생님들만 볼 수 있어요.");
  const [rows] = (await kv(["LRANGE", `${P}memos:${studentId}`, 0, 499], auditCmd(s, "memo.view", studentId))) as [string[]];
  return rows
    .map((r) => JSON.parse(r) as StoredMemo)
    .filter((m) => s.board !== "sw" || m.by === s.userId) // 사회복무요원은 자기가 쓴 메모만
    .map((m) => ({ ...m, byName: nameOut(m.byName), body: decrypt(m.body) }));
}

export async function addMemo(s: BoardSession, studentId: string, date: string, body: string) {
  await requireStudentAccess(s, studentId);
  if (s.board === "parent") throw new HttpError(403, "활동 메모는 선생님들만 쓸 수 있어요.");
  const m: StoredMemo = { id: newId(), by: s.userId, byRole: s.board, byName: encrypt(await displayName(s)), at: Date.now(), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(), body: encrypt(body) };
  await kv(["LPUSH", `${P}memos:${studentId}`, JSON.stringify(m)], auditCmd(s, "memo.create", studentId));
}

export async function deleteMemo(s: BoardSession, studentId: string, memoId: string) {
  await requireStudentAccess(s, studentId);
  const rows = (await kv1("LRANGE", `${P}memos:${studentId}`, 0, -1)) as string[];
  const row = rows.find((r) => (JSON.parse(r) as StoredMemo).id === memoId);
  if (!row) throw new HttpError(404, "없는 메모예요.");
  await kv(["LREM", `${P}memos:${studentId}`, 0, row], auditCmd(s, "memo.delete", studentId));
}

// ---------------------------------------------------------------- 새 글 알림 (배지)

/** 학부모: 안 읽은 공지 · 알림장 수 / 교사: 안 읽은 학부모 답글 · 보내야 할 초안 수 */
export async function unreadSummary(s: BoardSession) {
  if (s.board === "sw" || s.board === "aide") return { notices: 0, messages: 0, drafts: 0 };
  const students = await listStudents(s);
  const noticeIds = s.board === "parent" ? ((await kv1("ZREVRANGE", `${P}notices`, 0, 49)) as string[]) : [];
  const threadIds = students.length ? ((await kv(...students.map((st): Cmd => ["ZREVRANGE", `${P}thread:${st.id}`, 0, 49]))) as string[][]) : [];
  const allMsg = threadIds.flat();
  if (!noticeIds.length && !allMsg.length) return { notices: 0, messages: 0, drafts: 0 };
  const res = await kv(
    ...noticeIds.map((id): Cmd => ["SISMEMBER", `${P}read:${id}`, s.userId]),
    ...allMsg.flatMap((id): Cmd[] => [["GET", `${P}msg:${id}`], ["SISMEMBER", `${P}read:${id}`, s.userId]]),
  );
  const notices = noticeIds.filter((_, i) => Number(res[i]) === 0).length;
  let messages = 0;
  let drafts = 0;
  allMsg.forEach((_, i) => {
    const raw = res[noticeIds.length + i * 2] as string | null;
    if (!raw) return;
    const m = JSON.parse(raw) as StoredMsg;
    const read = Number(res[noticeIds.length + i * 2 + 1]) === 1 || m.by === s.userId;
    if (s.board === "parent" && m.status === "sent" && m.kind === "note" && !read) messages++;
    if (s.board === "teacher" && m.kind === "reply" && !read) messages++;
    if (s.board === "teacher" && m.status === "draft") drafts++;
  });
  return { notices, messages, drafts };
}

// ---------------------------------------------------------------- 내보내기 (교사)

export async function exportAll(s: BoardSession) {
  const students = await listStudents(s);
  const out = {
    exportedAt: new Date().toISOString(),
    notices: (await listNotices(s)).map(({ readers: _r, read: _read, ...n }) => n), // eslint-disable-line @typescript-eslint/no-unused-vars
    students: [] as { name: string; messages: Msg[]; memos: Memo[] }[],
  };
  for (const st of students) out.students.push({ name: st.name, messages: await listThread(s, st.id), memos: await listMemos(s, st.id) });
  await audit(s, "export");
  return out;
}
