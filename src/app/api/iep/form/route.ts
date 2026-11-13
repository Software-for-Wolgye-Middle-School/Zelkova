import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { loadIepForm } from "@/lib/iepFormFile";

/** 학교 개별화교육계획 한글 빈 양식의 모양 (문단 · 표 · 칸, 학생 칸마다 나눔). 화면이 이대로 그려 고치게 함 */
export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const loaded = await loadIepForm(request);
  if (!loaded) return Response.json({ error: "한글 빈 양식 파일(templates/iep-form.hwp)을 읽지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(loaded.form, { headers: { "Cache-Control": "private, max-age=600" } });
}
