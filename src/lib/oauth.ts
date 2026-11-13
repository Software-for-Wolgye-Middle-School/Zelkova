import { createHash, randomBytes } from "node:crypto";
import { createSession, cookieLine, readCookie, SESSION_SECONDS, sessionCookie, signValue, verifyValue } from "@/lib/auth";
import { auditCmd, clean, encrypt, getUser, HttpError, newId, type BoardRole, type BoardUser } from "@/lib/board";
import { kv, kv1 } from "@/lib/kv";

/**
 * 카카오 · 구글 · 네이버 로그인 (서버 전용, OAuth 2.0 인가 코드 방식).
 * 각 서비스에서 받는 것은 그 서비스 안의 사용자 번호 하나뿐이고(이메일 · 프로필은 요청하지 않음), 그 번호도 해시로만 저장함.
 * 이름과 직급은 처음 가입할 때 직접 적고, 관리자(또는 특수교사)가 승인해야 도구를 쓸 수 있음.
 *
 * 환경 변수: KAKAO_CLIENT_ID (REST API 키) · KAKAO_CLIENT_SECRET (쓰는 경우만)
 *            GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · NAVER_CLIENT_ID · NAVER_CLIENT_SECRET
 * 각 서비스에 등록할 Redirect URI: https://<사이트 주소>/api/oauth/<kakao|google|naver>/callback
 */

export type Provider = "kakao" | "google" | "naver";
export const PROVIDERS: Provider[] = ["kakao", "google", "naver"];
export const isProvider = (v: unknown): v is Provider => PROVIDERS.includes(v as Provider);

const STATE_COOKIE = "zelkova_oauth";
const SIGNUP_COOKIE = "zelkova_signup";
/** 가입 화면에서 이름 · 직급을 적을 시간 */
const SIGNUP_SECONDS = 15 * 60;

type Conf = { id?: string; secret?: string; authorize: string; token: string; me: string; scope?: string; userId: (data: Record<string, unknown>) => unknown };
const CONF: Record<Provider, Conf> = {
  kakao: {
    id: process.env.KAKAO_CLIENT_ID,
    secret: process.env.KAKAO_CLIENT_SECRET,
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    me: "https://kapi.kakao.com/v2/user/me",
    userId: (d) => d.id,
  },
  google: {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    me: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid",
    userId: (d) => d.sub,
  },
  naver: {
    id: process.env.NAVER_CLIENT_ID,
    secret: process.env.NAVER_CLIENT_SECRET,
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    me: "https://openapi.naver.com/v1/nid/me",
    userId: (d) => (d.response as { id?: unknown } | undefined)?.id,
  },
};

/** 이 서비스의 키가 서버에 설정되어 있는지 (화면에 단추를 보여 줄지) */
export const configured = (p: Provider) => !!CONF[p].id && (p === "kakao" || !!CONF[p].secret);

const origin = (request: Request) => process.env.APP_ORIGIN?.replace(/\/$/, "") ?? new URL(request.url).origin;
const redirectUri = (request: Request, p: Provider) => `${origin(request)}/api/oauth/${p}/callback`;

/** 서비스 로그인 화면으로 보냄 (위조 요청을 막는 state 값을 쿠키에 함께 둠) */
export function startLogin(request: Request, p: Provider): Response {
  const c = CONF[p];
  if (!configured(p)) return Response.redirect(`${origin(request)}/?login_error=${p}_not_configured`, 302);
  const state = randomBytes(16).toString("base64url");
  const url = new URL(c.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.id!);
  url.searchParams.set("redirect_uri", redirectUri(request, p));
  url.searchParams.set("state", state);
  if (c.scope) url.searchParams.set("scope", c.scope);
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": cookieLine(STATE_COOKIE, signValue(`${p}:${state}`, 600), 600) } });
}

/** 서비스 안의 사용자 번호 → 저장 열쇠 (번호는 해시로만) */
const linkKey = (p: Provider, sub: string) => `zelkova:board:oauth:${p}:${createHash("sha256").update(`${p}:${sub}`).digest("base64url")}`;

/** 서비스에서 돌아왔을 때: 코드를 사용자 번호로 바꾸고, 있는 계정이면 로그인 · 없으면 가입 화면으로 */
export async function finishLogin(request: Request, p: Provider): Promise<Response> {
  const url = new URL(request.url);
  const home = origin(request);
  const fail = (why: string) =>
    new Response(null, { status: 302, headers: { Location: `${home}/?login_error=${why}`, "Set-Cookie": cookieLine(STATE_COOKIE, "", 0) } });
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const saved = verifyValue(decodeURIComponent(readCookie(request, STATE_COOKIE) ?? ""));
  if (!code || !state || saved !== `${p}:${state}`) return fail("state");

  let sub: string;
  try {
    sub = await fetchUserId(request, p, code, state);
  } catch (e) {
    console.error(`${p} 로그인 실패`, e instanceof Error ? e.message : e);
    return fail("provider");
  }

  const key = linkKey(p, sub);
  const userId = (await kv1("GET", key)) as string | null;
  const user = userId ? await getUser(userId) : null;
  const headers = new Headers({ Location: `${home}/` });
  headers.append("Set-Cookie", cookieLine(STATE_COOKIE, "", 0));
  if (user) {
    const role = user.status === "pending" ? "pending" : user.role;
    headers.append("Set-Cookie", sessionCookie(createSession(role, user.id), SESSION_SECONDS));
    await kv(auditCmd({ role, userId: user.id }, `login.${p}`));
  } else {
    // 처음 온 사람: 가입 화면에서 이름 · 직급을 적으면 계정을 만듦
    headers.set("Location", `${home}/?signup=1`);
    headers.append("Set-Cookie", cookieLine(SIGNUP_COOKIE, signValue(key, SIGNUP_SECONDS), SIGNUP_SECONDS));
  }
  return new Response(null, { status: 302, headers });
}

async function fetchUserId(request: Request, p: Provider, code: string, state: string): Promise<string> {
  const c = CONF[p];
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: c.id!, redirect_uri: redirectUri(request, p), code });
  if (c.secret) form.set("client_secret", c.secret);
  if (p === "naver") form.set("state", state);
  const tokenRes = await fetch(c.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !token.access_token) throw new Error(`token ${tokenRes.status} ${token.error ?? ""}`);
  const meRes = await fetch(c.me, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  const me = (await meRes.json().catch(() => ({}))) as Record<string, unknown>;
  const sub = c.userId(me);
  if (!meRes.ok || (typeof sub !== "string" && typeof sub !== "number") || !String(sub)) throw new Error(`me ${meRes.status}`);
  return String(sub);
}

/** 가입 화면을 보여 줘야 하는지 (서비스 로그인을 마쳤지만 아직 계정이 없음) */
export const hasSignupTicket = (request: Request) => !!verifyValue(decodeURIComponent(readCookie(request, SIGNUP_COOKIE) ?? ""));

export const SIGNUP_ROLES: Record<string, BoardRole> = { sw: "sw", teacher: "teacher", aide: "aide", parent: "parent" };

/** 이름 · 직급을 받아 승인 대기 계정을 만들고 로그인시킴 */
export async function signup(request: Request, nameInput: unknown, roleInput: unknown): Promise<Response> {
  const key = verifyValue(decodeURIComponent(readCookie(request, SIGNUP_COOKIE) ?? ""));
  if (!key) throw new HttpError(400, "가입 시간이 지났어요. 처음 화면에서 다시 로그인해 주세요.");
  const name = clean(nameInput, 20);
  const requested = SIGNUP_ROLES[clean(roleInput, 10)];
  if (!name) throw new HttpError(400, "이름을 적어 주세요.");
  if (!requested) throw new HttpError(400, "직급을 골라 주세요.");
  if (await kv1("GET", key)) throw new HttpError(409, "이미 가입한 계정이에요. 처음 화면에서 다시 로그인해 주세요.");
  const user: BoardUser = { id: newId(), role: requested, requestedRole: requested, status: "pending", name, studentIds: [], createdAt: Date.now(), oauth: [key] };
  await kv(
    ["SET", key, user.id],
    ["SET", `zelkova:board:user:${user.id}`, JSON.stringify({ ...user, name: encrypt(name) })],
    ["SADD", "zelkova:board:users", user.id],
    auditCmd({ role: "pending", userId: user.id }, `user.signup.${requested}`),
  );
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", sessionCookie(createSession("pending", user.id), SESSION_SECONDS));
  headers.append("Set-Cookie", cookieLine(SIGNUP_COOKIE, "", 0));
  return new Response(JSON.stringify({ ok: true }), { headers });
}
