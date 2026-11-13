import { handle, rateLimit } from "@/lib/board";
import { signup } from "@/lib/oauth";

/** 소셜 로그인 뒤 처음 가입: { name, role: "sw" | "teacher" | "aide" | "parent" } → 승인 대기 계정 */
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "signup");
    const body = (await request.json().catch(() => null)) as { name?: unknown; role?: unknown } | null;
    return signup(request, body?.name, body?.role);
  });
}
