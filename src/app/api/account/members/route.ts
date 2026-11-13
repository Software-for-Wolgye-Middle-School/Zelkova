import { connection } from "next/server";
import { clean, deleteUser, handle, HttpError, listUsers, requireRole, setMember } from "@/lib/board";

/** 회원 관리 (관리자 · 특수교사만): 승인 대기 · 가입한 계정 목록 */
export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    await requireRole(request, ["teacher"]);
    return { users: await listUsers() };
  });
}

/** 승인하거나 직급 · 자녀 연결을 바꿈: { id, role, studentIds } */
export async function PATCH(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    const b = (await request.json().catch(() => null)) as { id?: unknown; role?: unknown; studentIds?: unknown } | null;
    const role = clean(b?.role, 10);
    if (role !== "teacher" && role !== "aide" && role !== "sw" && role !== "parent") throw new HttpError(400, "직급을 골라 주세요.");
    const studentIds = Array.isArray(b?.studentIds) ? b.studentIds.map((v) => clean(v, 32)).filter(Boolean).slice(0, 10) : [];
    await setMember(s, clean(b?.id, 40), role, studentIds);
  });
}

/** 가입 거절 · 계정 지우기: ?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const s = await requireRole(request, ["teacher"]);
    await deleteUser(s, new URL(request.url).searchParams.get("id") ?? "");
  });
}
