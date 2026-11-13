import { connection } from "next/server";
import { addStudent, clean, handle, HttpError, listStudents, removeStudent, requireRole } from "@/lib/board";

/** 학생 목록 (학부모는 자기 자녀만) */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const s = requireRole(request, ["teacher", "aide", "sw", "parent"]);
    return { students: await listStudents(s) };
  });
}

/** 학생 더하기 (교사만): { name } — 이름은 암호화해서 저장 */
export async function POST(request: Request) {
  return handle(async () => {
    const s = requireRole(request, ["teacher"]);
    const name = clean(((await request.json().catch(() => null)) as { name?: unknown } | null)?.name, 30);
    if (!name) throw new HttpError(400, "학생 이름을 적어 주세요.");
    return { student: await addStudent(s, name) };
  });
}

/** 학생과 그 학생의 알림장 · 메모를 모두 지움 (교사만): ?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = requireRole(request, ["teacher"]);
    await removeStudent(s, new URL(request.url).searchParams.get("id") ?? "");
  });
}
