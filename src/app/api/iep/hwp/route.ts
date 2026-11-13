import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { docTitle, isDocId, metaFromFields, withTerm } from "@/lib/iep";
import { writeForm } from "@/lib/hwpForm";
import { buildIepHwp } from "@/lib/iepHwp";
import { loadIepForm } from "@/lib/iepFormFile";
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
    const name = `${docTitle(metaFromFields(fields))}.hwp`.replace(/[\\/:*?"<>|]/g, "");
    let file: Buffer;
    if (fields.form) {
      // 학교 한글 빈 양식에 고친 칸만 넣음. 안 고친 "2026학년도 2학기" 같은 줄은 이 문서의 학년도 · 학기로
      const loaded = await loadIepForm(request);
      if (!loaded) return Response.json({ error: "한글 빈 양식 파일(templates/iep-form.hwp)을 읽지 못했어요." }, { status: 503, headers: NO_STORE });
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) if (/^(c|p)\./.test(k)) values[k] = v;
      for (const sec of loaded.form.sections)
        for (const b of sec.blocks) {
          if (b.type === "p" && values[b.key] === undefined && withTerm(b.text, fields.year ?? "", fields.semester ?? "") !== b.text) values[b.key] = withTerm(b.text, fields.year ?? "", fields.semester ?? "");
        }
      file = writeForm(loaded.file, values, name.replace(/\.hwp$/, ""));
    } else {
      // 예전 문서(직접 만든 양식): 예전 빈 양식으로
      const tpl = await fetch(new URL("/templates/iep-template.hwp", request.url), { cache: "force-cache" }).catch(() => null);
      if (!tpl?.ok) return Response.json({ error: "예전 한글 빈 양식 파일(templates/iep-template.hwp)이 없어요." }, { status: 503, headers: NO_STORE });
      file = buildIepHwp(fields, new Uint8Array(await tpl.arrayBuffer()));
    }
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
