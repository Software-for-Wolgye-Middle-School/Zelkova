import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { buildGuideIndex } from "@/lib/guideRag";
import { readGuide, writeGuide } from "@/lib/guideStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 업무 안내 글에는 학생 정보가 들어 있으니 로그인한 사람만 보고 고칠 수 있음 */
const unauthorized = () => Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return unauthorized();
  return Response.json(await readGuide(), { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return Response.json({ error: "text 가 필요해요." }, { status: 400, headers: NO_STORE });
  try {
    const guide = await writeGuide(body.text);
    // 저장하면서 RAG 색인도 바로 만들어 둠. 실패해도 저장은 된 것이고, 첫 질문 때 다시 만듦
    const key = process.env.GEMINI_API_KEY;
    if (key && guide.text) await buildGuideIndex(key, guide.text).catch((e) => console.error(e));
    return Response.json(guide, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "업무 안내를 서버에 저장하지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
