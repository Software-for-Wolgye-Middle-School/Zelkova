import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { initialFields, isDocId, newDocId } from "@/lib/iep";
import { createDoc, deleteDoc, listDocs } from "@/lib/iepStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 개별화교육계획은 로그인한 사람만 보고 고칠 수 있음 */
const unauthorized = () => Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 모든 개별화교육계획 목록 */
export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return unauthorized();
  try {
    return Response.json({ docs: await listDocs() }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "목록을 불러오지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}

/** 새 개별화교육계획 (한 학년도 · 학기): { year, semester, students: [{ grade, cls, name, subjects }], by } */
export async function POST(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const year = text(body?.year, 4);
  if (!/^\d{4}$/.test(year)) return Response.json({ error: "학년도를 네 자리 숫자로 적어 주세요." }, { status: 400, headers: NO_STORE });
  const students = (Array.isArray(body?.students) ? body.students : [])
    .slice(0, 40)
    .map((s) => {
      const v = (s ?? {}) as Record<string, unknown>;
      return {
        grade: text(v.grade, 2),
        cls: text(v.cls, 2),
        name: text(v.name, 20),
        subjects: Array.isArray(v.subjects) ? v.subjects.map((x) => text(x, 20)).filter(Boolean).slice(0, 12) : [],
      };
    })
    .filter((s) => s.name);
  const fields = initialFields({ year, semester: body?.semester === "1" ? "1" : "2", students });
  try {
    const meta = await createDoc(newDocId(), fields, text(body?.by, 20));
    return Response.json({ doc: meta }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "만들지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}

/** 개별화교육계획 지우기: ?id= */
export async function DELETE(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!isDocId(id)) return Response.json({ error: "id 가 필요해요." }, { status: 400, headers: NO_STORE });
  try {
    await deleteDoc(id);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "지우지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
