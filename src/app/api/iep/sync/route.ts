import { isAuthed } from "@/lib/auth";
import { cleanCursor, isDocId, isFieldKey, VALUE_MAX } from "@/lib/iep";
import { syncDoc, type Change } from "@/lib/iepStore";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 실시간 동시 편집: 브라우저가 1초쯤마다 부름.
 * { id, since, me: { id, name, color, field }, changes: [{ key, base, value }] }
 * → 보낸 칸을 합쳐 저장하고, since 이후 바뀐 칸과 지금 문서를 보고 있는 다른 사람들을 돌려줌
 */
export async function POST(request: Request) {
  if (!isAuthed(request)) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { id?: unknown; since?: unknown; me?: Record<string, unknown>; changes?: unknown } | null;
  const since = Number(body?.since);
  if (!body || !isDocId(body.id) || !Number.isFinite(since) || since < 0 || !body.me || typeof body.me.id !== "string") {
    return Response.json({ error: "id, since, me 가 필요해요." }, { status: 400, headers: NO_STORE });
  }
  const changes: Change[] = [];
  for (const c of Array.isArray(body.changes) ? body.changes.slice(0, 300) : []) {
    const v = c as Partial<Change>;
    if (isFieldKey(v.key) && typeof v.base === "string" && typeof v.value === "string") {
      changes.push({ key: v.key, base: v.base.slice(0, VALUE_MAX), value: v.value.slice(0, VALUE_MAX) });
    }
  }
  const me = {
    id: String(body.me.id).slice(0, 40),
    name: String(body.me.name ?? "").slice(0, 20) || "선생님",
    color: /^#[0-9a-f]{6}$/i.test(String(body.me.color)) ? String(body.me.color) : "#6366f1",
    field: isFieldKey(body.me.field) ? body.me.field : "",
    cursor: cleanCursor(body.me.cursor),
  };
  try {
    const result = await syncDoc(body.id, since, changes, me);
    if (result.gone) return Response.json({ gone: true }, { status: 404, headers: NO_STORE });
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "서버에 저장하지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
