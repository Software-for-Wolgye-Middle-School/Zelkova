import { SESSION_SECONDS, createSession, sessionCookie } from "@/lib/auth";
import { clean, handle, HttpError, rateLimit, redeemInvite } from "@/lib/board";

/** 초대 코드로 가입하고 바로 로그인: { code, loginId, password, name } */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "register");
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const code = clean(body?.code, 20);
    const loginId = clean(body?.loginId, 20);
    const name = clean(body?.name, 20);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!code) throw new HttpError(400, "초대 코드를 적어 주세요.");
    if (!/^[A-Za-z0-9_.-]{4,20}$/.test(loginId)) throw new HttpError(400, "아이디는 영어 · 숫자로 4~20자로 적어 주세요.");
    if (password.length < 8 || password.length > 100) throw new HttpError(400, "비밀번호는 8자 이상으로 적어 주세요.");
    if (!name) throw new HttpError(400, "이름을 적어 주세요. (예: 홍길동 어머님)");
    const user = await redeemInvite(code, loginId, password, name);
    return Response.json(
      { ok: true, role: user.role },
      { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(createSession(user.role, user.id), SESSION_SECONDS) } },
    );
  });
}
