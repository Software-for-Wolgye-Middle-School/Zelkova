import { isProvider, startLogin } from "@/lib/oauth";

/** 카카오 · 구글 · 네이버 로그인 시작: 그 서비스 로그인 화면으로 보냄 */
export async function GET(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  return startLogin(request, provider);
}
