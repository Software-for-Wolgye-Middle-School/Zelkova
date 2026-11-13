import { authConfigured, checkCredentials, createSession, requestRole, SESSION_SECONDS, sessionCookie } from "@/lib/auth";
import { rateLimit, TooManyRequests } from "@/lib/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

/** 지금 로그인되어 있는지, 관리자인지 */
export async function GET(request: Request) {
  const role = requestRole(request);
  return Response.json({ authed: role !== null, admin: role === "admin" }, { headers: NO_STORE });
}

/** 로그인: { id, password } 가 맞으면 세션 쿠키를 줌 (IP 당 5분에 10번까지) */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return Response.json({ error: "서버에 관리자 계정이 아직 설정되지 않았어요. 관리자에게 문의해 주세요." }, { status: 503, headers: NO_STORE });
  }
  try {
    await rateLimit(request, "login");
  } catch (e) {
    if (e instanceof TooManyRequests) return Response.json({ error: e.message }, { status: 429, headers: NO_STORE });
    console.error(e); // 횟수 제한 저장소에 닿지 못해도 로그인은 막지 않음
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = id && password ? checkCredentials(id, password) : null;
  if (!role) {
    // 비밀번호를 빠르게 여러 번 맞혀 보지 못하도록 틀리면 잠깐 기다림
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 401, headers: NO_STORE });
  }
  return Response.json(
    { authed: true, admin: role === "admin" },
    { headers: { ...NO_STORE, "Set-Cookie": sessionCookie(createSession(role), SESSION_SECONDS) } },
  );
}

/** 로그아웃 */
export async function DELETE() {
  return Response.json({ authed: false }, { headers: { ...NO_STORE, "Set-Cookie": sessionCookie("", 0) } });
}
