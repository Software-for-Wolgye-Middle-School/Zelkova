import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { addSet, isValidId, listSets, removeSet } from "@/lib/bankbookBackgroundStore";

/** 등록된 칭찬통장 배경 목록 */
export async function GET() {
  await connection(); // 빌드할 때 한 번 만들어 두지 않고 요청마다 서버 디스크를 읽도록
  try {
    return Response.json(await listSets(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return new Response("배경 목록을 불러오지 못했어요.", { status: 500 });
  }
}

/** 앞면 · 뒷면 사진 한 세트를 배경으로 등록 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  try {
    const result = await addSet(body);
    if ("error" in result) return new Response(result.error, { status: result.status });
    return Response.json(result.set);
  } catch (e) {
    console.error(e);
    return new Response("서버에 저장하지 못했어요.", { status: 500 });
  }
}

/** 등록된 배경 하나 지우기 (?id=custom-…) */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!isValidId(id)) return new Response("잘못된 요청이에요.", { status: 400 });
  try {
    await removeSet(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error(e);
    return new Response("지우지 못했어요.", { status: 500 });
  }
}
