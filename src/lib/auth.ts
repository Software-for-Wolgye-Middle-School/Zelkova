import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 학생 정보 관리 로그인 (서버 전용).
 * 아이디와 비밀번호는 코드에 두지 않고 서버 환경 변수에만 둠. 비밀번호는 원래 글자 대신 scrypt 해시로 보관:
 *   ADMIN_ID, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH (base64url), AUTH_SECRET (세션 서명 키)
 * 값은 `node scripts/hash-password.mjs <아이디> <비밀번호>` 로 만들 수 있음.
 */

const ADMIN_ID = process.env.ADMIN_ID?.normalize("NFC");
const SALT = process.env.ADMIN_PASSWORD_SALT;
const HASH = process.env.ADMIN_PASSWORD_HASH;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export const SESSION_COOKIE = "zelkova_session";
/** 한 번 로그인하면 12시간 동안 유지 */
export const SESSION_SECONDS = 12 * 60 * 60;

/** 서버에 관리자 계정이 설정되어 있는지 */
export const authConfigured = () => !!(ADMIN_ID && SALT && HASH);

// 서명 키는 AUTH_SECRET 을 쓰고, 없으면 비밀번호 해시에서 만듦 (해시도 환경 변수에만 있음)
const secret = () => process.env.AUTH_SECRET ?? `zelkova:${SALT}:${HASH}`;

const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** 아이디 · 비밀번호가 맞는지 (한글은 입력 방식에 따라 글자 조합이 달라질 수 있어 NFC 로 맞춤) */
export function checkCredentials(id: string, password: string) {
  if (!ADMIN_ID || !SALT || !HASH) return false;
  const idOk = same(Buffer.from(id.trim().normalize("NFC")), Buffer.from(ADMIN_ID));
  const hash = scryptSync(password.normalize("NFC"), SALT, 32, SCRYPT);
  // 아이디가 틀려도 해시는 계산해서 걸리는 시간으로 아이디를 알아낼 수 없게 함
  return same(hash, Buffer.from(HASH, "base64url")) && idOk;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** 만료 시각을 담고 서명한 세션 값 */
export function createSession() {
  const payload = String(Date.now() + SESSION_SECONDS * 1000);
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(token: string | undefined) {
  if (!token || !authConfigured()) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !same(Buffer.from(signature), Buffer.from(sign(payload)))) return false;
  return Number(payload) > Date.now();
}

/** 요청에 로그인 세션 쿠키가 있는지 */
export function isAuthed(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return isValidSession(token ? decodeURIComponent(token) : undefined);
}

export const sessionCookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
