import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 학생 정보 관리 로그인 (서버 전용).
 * 아이디와 비밀번호는 코드에 두지 않고 서버 환경 변수에만 둠. 비밀번호는 원래 글자 대신 scrypt 해시로 보관:
 *   ADMIN_ID, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH (base64url), AUTH_SECRET (세션 서명 키)
 * 값은 `node scripts/hash-password.mjs <아이디> <비밀번호>` 로 만들 수 있음.
 *
 * 관리자(업무 안내 편집 등) 계정은 따로: SUPER_ADMIN_ID, SUPER_ADMIN_PASSWORD_SALT, SUPER_ADMIN_PASSWORD_HASH
 * (`node scripts/hash-password.mjs --super <아이디> <비밀번호>`). 관리자로 로그인하면 일반 로그인으로 되는 일도 모두 할 수 있음.
 *
 * 특수교사(소통게시판 관리) 계정도 따로: TEACHER_ID, TEACHER_PASSWORD_SALT, TEACHER_PASSWORD_HASH
 * (`node scripts/hash-password.mjs --teacher <아이디> <비밀번호>`). 특수교사는 일반 로그인으로 되는 일도 모두 할 수 있음.
 * 실무사 · 사회복무요원 · 학부모 계정(aide · sw · parent)은 소통게시판에서 교사가 준 초대 코드로 만들고 서버 저장소에 둠 (lib/board).
 *
 * 세션 값: "만료시각" (일반) · "만료시각:admin" · "만료시각:역할:사용자id" (teacher · aide · sw · parent) 에 AUTH_SECRET 서명.
 * 학생 정보는 세션에 넣지 않음.
 */

const ADMIN_ID = process.env.ADMIN_ID?.normalize("NFC");
const SALT = process.env.ADMIN_PASSWORD_SALT;
const HASH = process.env.ADMIN_PASSWORD_HASH;
const SUPER_ID = process.env.SUPER_ADMIN_ID?.normalize("NFC");
const SUPER_SALT = process.env.SUPER_ADMIN_PASSWORD_SALT;
const SUPER_HASH = process.env.SUPER_ADMIN_PASSWORD_HASH;
const TEACHER_ID = process.env.TEACHER_ID?.normalize("NFC");
const TEACHER_SALT = process.env.TEACHER_PASSWORD_SALT;
const TEACHER_HASH = process.env.TEACHER_PASSWORD_HASH;
const SCRYPT = { N: 16384, r: 8, p: 1 };

/** user: 일반(실무사 · 사회복무요원 공용) · admin: 관리자 · teacher: 특수교사 · aide/sw/parent: 초대 코드로 만든 소통게시판 계정 */
/** pending: 카카오 · 구글 · 네이버로 가입하고 관리자 승인을 기다리는 계정 (아무 도구도 못 씀) */
export type Role = "user" | "admin" | "teacher" | "aide" | "sw" | "parent" | "pending";
export type Session = { role: Role; userId: string };
const ACCOUNT_ROLES: Role[] = ["teacher", "aide", "sw", "parent", "pending"];
/** 원래 있던 도구(시간표 · 학생 정보 · 활동일지 · 업무 안내 · 개별화교육계획)를 쓸 수 있는 역할 (학부모 · 승인 대기는 아님) */
export const STAFF_ROLES: Role[] = ["user", "admin", "teacher", "aide", "sw"];

export const SESSION_COOKIE = "zelkova_session";
/** 한 번 로그인하면 12시간 동안 유지 */
export const SESSION_SECONDS = 12 * 60 * 60;

/** 서버에 관리자 계정이 설정되어 있는지 */
export const authConfigured = () => !!(ADMIN_ID && SALT && HASH);

// 서명 키는 AUTH_SECRET 을 쓰고, 없으면 비밀번호 해시에서 만듦 (해시도 환경 변수에만 있음)
const secret = () => process.env.AUTH_SECRET ?? `zelkova:${SALT}:${HASH}`;

const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** 한 계정의 아이디 · 비밀번호가 맞는지 (한글은 입력 방식에 따라 글자 조합이 달라질 수 있어 NFC 로 맞춤) */
function matches(id: string, password: string, wantId: string | undefined, salt: string | undefined, hash: string | undefined) {
  if (!wantId || !salt || !hash) return false;
  const idOk = same(Buffer.from(id.trim().normalize("NFC")), Buffer.from(wantId));
  const got = scryptSync(password.normalize("NFC"), salt, 32, SCRYPT);
  // 아이디가 틀려도 해시는 계산해서 걸리는 시간으로 아이디를 알아낼 수 없게 함
  return same(got, Buffer.from(hash, "base64url")) && idOk;
}

/** 맞는 계정의 권한 (관리자 계정을 먼저 봄). 둘 다 아니면 null */
export function checkCredentials(id: string, password: string): Role | null {
  if (matches(id, password, SUPER_ID, SUPER_SALT, SUPER_HASH)) return "admin";
  if (matches(id, password, TEACHER_ID, TEACHER_SALT, TEACHER_HASH)) return "teacher";
  if (matches(id, password, ADMIN_ID, SALT, HASH)) return "user";
  return null;
}

/** 환경 변수 계정의 사용자 id (서버 저장소 계정은 자기 id) */
export const envUserId = (role: Role) => (role === "admin" ? "admin" : role === "teacher" ? "teacher" : "shared");

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** 만료 시각과 권한(과 소통게시판 계정이면 사용자 id)을 담고 서명한 세션 값 */
export function createSession(role: Role = "user", userId = "") {
  const exp = String(Date.now() + SESSION_SECONDS * 1000);
  const payload = role === "user" ? exp : role === "admin" ? `${exp}:admin` : `${exp}:${role}:${userId || envUserId(role)}`;
  return `${payload}.${sign(payload)}`;
}

/** 올바른 세션이면 그 권한과 사용자 id, 아니면 null */
export function parseSession(token: string | undefined): Session | null {
  if (!token || !authConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !same(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  const [exp, role, userId] = payload.split(":");
  if (!(Number(exp) > Date.now())) return null;
  if (!role) return { role: "user", userId: "shared" };
  if (role === "admin") return { role: "admin", userId: "admin" };
  if (ACCOUNT_ROLES.includes(role as Role) && userId && /^[\w-]{1,40}$/.test(userId)) return { role: role as Role, userId };
  return null;
}

export const sessionRole = (token: string | undefined): Role | null => parseSession(token)?.role ?? null;

export const isValidSession = (token: string | undefined) => sessionRole(token) !== null;

/** 요청의 로그인 세션 (로그인하지 않았으면 null) */
export function requestSession(request: Request): Session | null {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return parseSession(token ? decodeURIComponent(token) : undefined);
}

/** 요청의 로그인 권한 (로그인하지 않았으면 null) */
export const requestRole = (request: Request): Role | null => requestSession(request)?.role ?? null;

/** 원래 있던 도구를 쓸 수 있는 로그인인지 (일반 · 관리자 · 특수교사 · 실무사 · 사회복무요원). 학부모 · 승인 대기는 아님 */
export const isAuthed = (request: Request) => STAFF_ROLES.includes(requestRole(request) as Role);

/** 관리자로 로그인했는지 */
export const isAdmin = (request: Request) => requestRole(request) === "admin";

/** 짧은 값에 서명 (소셜 로그인 가입 표 등). 만료 시각을 함께 넣음 */
export function signValue(value: string, seconds: number) {
  const payload = `${value}|${Date.now() + seconds * 1000}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** signValue 로 만든 값이 올바르고 아직 유효하면 원래 값, 아니면 null */
export function verifyValue(token: string | undefined | null): string | null {
  if (!token) return null;
  const [b64, signature] = token.split(".");
  if (!b64 || !signature) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  if (!same(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  const at = payload.lastIndexOf("|");
  return Number(payload.slice(at + 1)) > Date.now() ? payload.slice(0, at) : null;
}

/** 요청의 쿠키 하나 */
export const readCookie = (request: Request, name: string) =>
  (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/** httpOnly 쿠키 한 줄 */
export const cookieLine = (name: string, value: string, maxAge: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

export const sessionCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
