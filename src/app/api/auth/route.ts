import { authConfigured, checkCredentials, createSession, requestSession, SESSION_SECONDS, sessionCookie, STAFF_ROLES, type Role } from "@/lib/auth";
import { boardRoleOf, checkBoardLogin, getUser, HttpError, isEnvUser, rateLimit } from "@/lib/board";
import { configured, hasSignupTicket, PROVIDERS } from "@/lib/oauth";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 지금 로그인되어 있는지.
 * authed: 원래 있던 도구(행정 업무 탭 등)를 쓸 수 있는지 (일반 · 관리자 · 특수교사) · admin: 관리자인지 · board: 소통게시판 역할
 */
export async function GET(request: Request) {
  const s = requestSession(request);
  const providers = PROVIDERS.filter(configured);
  if (!s) return Response.json({ authed: false, admin: false, board: null, role: null, name: "", signup: hasSignupTicket(request), providers }, { headers: NO_STORE });

  // 서버 저장소 계정은 지금 상태로 다시 확인: 지운 계정은 로그아웃, 승인 · 직급이 바뀌었으면 세션을 새로 줌
  let role: Role = s.role;
  let name = s.role === "admin" ? "관리자" : s.role === "teacher" ? "특수교사" : "공용 계정";
  const headers = new Headers(NO_STORE);
  if (!isEnvUser(s.userId)) {
    const u = await getUser(s.userId).catch(() => undefined);
    if (u === null) {
      headers.append("Set-Cookie", sessionCookie("", 0));
      return Response.json({ authed: false, admin: false, board: null, role: null, name: "", signup: false, providers }, { headers });
    }
    if (u) {
      role = u.status === "pending" ? "pending" : u.role;
      name = u.name;
      if (role !== s.role) headers.append("Set-Cookie", sessionCookie(createSession(role, u.id), SESSION_SECONDS));
    }
  }
  return Response.json({ authed: STAFF_ROLES.includes(role), admin: role === "admin", board: boardRoleOf(role), role, name, signup: false, providers }, { headers });
}

/** 로그인: { id, password } 가 맞으면 세션 쿠키를 줌. 환경 변수 계정을 먼저 보고, 아니면 초대로 가입한 소통게시판 계정 */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return Response.json({ error: "서버에 관리자 계정이 아직 설정되지 않았어요. 관리자에게 문의해 주세요." }, { status: 503, headers: NO_STORE });
  }
  try {
    await rateLimit(request, "login");
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    console.error(e); // 횟수 제한 저장소에 닿지 못해도 로그인은 막지 않음
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown; password?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  let session: string | null = null;
  let role = id && password ? checkCredentials(id, password) : null;
  if (role) session = createSession(role);
  else if (id && password && /^[A-Za-z0-9_.-]{4,20}$/.test(id.trim())) {
    try {
      const user = await checkBoardLogin(id.trim(), password);
      if (user) {
        role = user.role;
        session = createSession(user.role, user.id);
      }
    } catch (e) {
      console.error(e);
    }
  }
  if (!role || !session) {
    // 비밀번호를 빠르게 여러 번 맞혀 보지 못하도록 틀리면 잠깐 기다림
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "아이디 또는 비밀번호가 맞지 않아요." }, { status: 401, headers: NO_STORE });
  }
  return Response.json(
    { authed: STAFF_ROLES.includes(role), admin: role === "admin", board: boardRoleOf(role) },
    { headers: { ...NO_STORE, "Set-Cookie": sessionCookie(session, SESSION_SECONDS) } },
  );
}

/** 로그아웃 */
export async function DELETE() {
  return Response.json({ authed: false }, { headers: { ...NO_STORE, "Set-Cookie": sessionCookie("", 0) } });
}
