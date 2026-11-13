import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { docTitle, isDocId, metaFromFields } from "@/lib/iep";
import { buildIepHwp } from "@/lib/iepHwp";
import { readDocFields } from "@/lib/iepStore";

const NO_STORE = { "Cache-Control": "no-store" };

/** 개별화교육계획을 학교 양식 그대로 한글(HWP) 파일로 내려받기: ?id= (학생 모두 한 파일에) */
export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  const id = new URL(request.url).searchParams.get("id");
  if (!isDocId(id)) return Response.json({ error: "id 가 필요해요." }, { status: 400, headers: NO_STORE });
  try {
    const fields = await readDocFields(id);
    if (!fields) return Response.json({ error: "없는 문서예요." }, { status: 404, headers: NO_STORE });
    // 빈 양식은 사이트의 공개 파일에서 읽음 (서버리스에서도 늘 같은 주소로 받을 수 있게)
    const tpl = await fetch(new URL("/templates/iep-template.hwp", request.url), { cache: "force-cache" }).catch(() => null);
    if (!tpl?.ok) return Response.json({ error: "한글 빈 양식 파일(templates/iep-template.hwp)이 아직 없어요." }, { status: 503, headers: NO_STORE });
    const file = buildIepHwp(fields, new Uint8Array(await tpl.arrayBuffer()));
    const name = `${docTitle(metaFromFields(fields))}.hwp`.replace(/[\\/:*?"<>|]/g, "");
    return new Response(new Uint8Array(file), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/x-hwp",
        "Content-Disposition": `attachment; filename="iep.hwp"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "한글 파일을 만들지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
