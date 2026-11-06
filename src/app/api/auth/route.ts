import { authConfigured, checkCredentials, createSession, isAuthed, SESSION_SECONDS, sessionCookie } from "@/lib/auth";

const NO_STORE = { "Cache-Control": "no-store" };

/** 지금 로그인되어 있는지 */
export async function GET(request: Request) {
  return Response.json({ authed: isAuthed(request) }, { headers: NO_STORE });
}

/** 로그인: { id, password } 가 맞으면 세션 쿠키를 줌 */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return Response.json({ error: "서버에 관리자 계정이 아직 설정되지 않았어요. 관리자에게 문의해 주세요." }, { status: 503, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!id || !password || !checkCredentials(id, password)) {
    // 비밀번호를 빠르게 여러 번 맞혀 보지 못하도록 틀리면 잠깐 기다림
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 401, headers: NO_STORE });
  }
  return Response.json(
    { authed: true },
    { headers: { ...NO_STORE, "Set-Cookie": sessionCookie(createSession(), SESSION_SECONDS) } },
  );
}

/** 로그아웃 */
export async function DELETE() {
  return Response.json({ authed: false }, { headers: { ...NO_STORE, "Set-Cookie": sessionCookie("", 0) } });
}
