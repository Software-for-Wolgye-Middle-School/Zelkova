import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readFormImage } from "@/lib/hwpForm";
import { loadIepForm } from "@/lib/iepFormFile";

/** 학교 한글 빈 양식에 든 학교 로고 그림 (표지의 「개별화교육계획」 위) */
export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  const loaded = await loadIepForm(request);
  const image = loaded ? readFormImage(loaded.file) : null;
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(image.data), { headers: { "Content-Type": image.type, "Cache-Control": "private, max-age=3600" } });
}
