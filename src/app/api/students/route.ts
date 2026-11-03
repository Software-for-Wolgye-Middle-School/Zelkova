import { connection } from "next/server";
import { readStudents, writeStudents } from "@/lib/studentStore";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  return Response.json({ students: await readStudents() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
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
