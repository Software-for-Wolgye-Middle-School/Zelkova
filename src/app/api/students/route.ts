import { connection } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readStudents, writeStudents } from "@/lib/studentStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 학생 정보는 로그인한 사람만 보고 고칠 수 있음 */
const unauthorized = () => Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  await connection();
  if (!isAuthed(request)) return unauthorized();
  return Response.json({ students: await readStudents() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!isAuthed(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { students?: unknown } | null;
  if (!body || !Array.isArray(body.students)) {
    return Response.json({ error: "students 목록이 필요해요." }, { status: 400 });
  }
  try {
    return Response.json({ students: await writeStudents(body.students) }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "학생 정보를 서버에 저장하지 못했어요." }, { status: 500 });
  }
}
