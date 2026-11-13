import { finishLogin, isProvider } from "@/lib/oauth";

/** 카카오 · 구글 · 네이버에서 돌아옴: 있는 계정이면 로그인, 처음이면 가입 화면으로 */
export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  return finishLogin(request, provider);
}
