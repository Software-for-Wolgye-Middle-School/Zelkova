import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 학생 정보 관리 로그인 (서버 전용).
 * 아이디와 비밀번호는 코드에 두지 않고 서버 환경 변수에만 둠. 비밀번호는 원래 글자 대신 scrypt 해시로 보관:
 *   ADMIN_ID, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH (base64url), AUTH_SECRET (세션 서명 키)
 * 값은 `node scripts/hash-password.mjs <아이디> <비밀번호>` 로 만들 수 있음.
 *
 * 관리자(업무 안내 편집 등) 계정은 따로: SUPER_ADMIN_ID, SUPER_ADMIN_PASSWORD_SALT, SUPER_ADMIN_PASSWORD_HASH
 * (`node scripts/hash-password.mjs --super <아이디> <비밀번호>`). 관리자로 로그인하면 일반 로그인으로 되는 일도 모두 할 수 있음.
 */

const ADMIN_ID = process.env.ADMIN_ID?.normalize("NFC");
const SALT = process.env.ADMIN_PASSWORD_SALT;
const HASH = process.env.ADMIN_PASSWORD_HASH;
const SUPER_ID = process.env.SUPER_ADMIN_ID?.normalize("NFC");
const SUPER_SALT = process.env.SUPER_ADMIN_PASSWORD_SALT;
const SUPER_HASH = process.env.SUPER_ADMIN_PASSWORD_HASH;
const SCRYPT = { N: 16384, r: 8, p: 1 };

/** user: 일반 로그인 · admin: 관리자 */
export type Role = "user" | "admin";

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
  if (matches(id, password, ADMIN_ID, SALT, HASH)) return "user";
  return null;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** 만료 시각과 권한을 담고 서명한 세션 값 ("만료시각" 또는 "만료시각:admin") */
export function createSession(role: Role = "user") {
  const exp = String(Date.now() + SESSION_SECONDS * 1000);
  const payload = role === "admin" ? `${exp}:admin` : exp;
  return `${payload}.${sign(payload)}`;
}

/** 올바른 세션이면 그 권한, 아니면 null */
export function sessionRole(token: string | undefined): Role | null {
  if (!token || !authConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !same(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  const [exp, role] = payload.split(":");
  if (!(Number(exp) > Date.now())) return null;
  return role === "admin" ? "admin" : "user";
}

export const isValidSession = (token: string | undefined) => sessionRole(token) !== null;

/** 요청의 로그인 권한 (로그인하지 않았으면 null) */
export function requestRole(request: Request): Role | null {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return sessionRole(token ? decodeURIComponent(token) : undefined);
}

/** 요청에 로그인 세션 쿠키가 있는지 (일반 · 관리자 모두) */
export const isAuthed = (request: Request) => requestRole(request) !== null;

/** 관리자로 로그인했는지 */
export const isAdmin = (request: Request) => requestRole(request) === "admin";

export const sessionCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
