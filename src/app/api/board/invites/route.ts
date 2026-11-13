import { clean, createInvite, handle, HttpError, requireRole } from "@/lib/board";

/** 초대 코드 발급 (교사만): { role: "aide" | "sw" | "parent", studentIds } → { code } (72시간 동안 한 번만 쓸 수 있음) */
export async function POST(request: Request) {
  return handle(async () => {
    const s = requireRole(request, ["teacher"]);
    const body = (await request.json().catch(() => null)) as { role?: unknown; studentIds?: unknown } | null;
    const role = clean(body?.role, 10);
    if (role !== "aide" && role !== "sw" && role !== "parent") throw new HttpError(400, "역할을 골라 주세요.");
    const studentIds = Array.isArray(body?.studentIds) ? body.studentIds.map((v) => clean(v, 32)).filter(Boolean).slice(0, 10) : [];
    return { code: await createInvite(s, role, studentIds) };
  });
}
