import { isAuthed } from "@/lib/auth";
import { sanitizeFields } from "@/lib/iep";
import { layoutIepV2 } from "@/lib/iepCompose";
import { loadIepForm } from "@/lib/iepFormFile";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 개별화교육계획 편집 화면의 모양: 화면의 지금 칸 값으로 한글 문서를 조립해, 그 문서의 표 · 칸과 저장 칸의 연결을 돌려줌.
 * 학생 · 영역 · 단기목표 줄이 바뀔 때만 다시 부름 (글을 고칠 때는 화면이 바로 그림)
 */
export async function POST(request: Request) {
  if (!isAuthed(request)) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { values?: unknown } | null;
  const loaded = await loadIepForm(request);
  if (!loaded) return Response.json({ error: "한글 빈 양식 파일(templates/iep-form.hwp)을 읽지 못했어요." }, { status: 503, headers: NO_STORE });
  try {
    return Response.json(layoutIepV2(sanitizeFields(body?.values), loaded.file), { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "양식을 만들지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
