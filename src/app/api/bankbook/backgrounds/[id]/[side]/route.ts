import { connection } from "next/server";
import { getImage, isSide } from "@/lib/bankbookBackgroundStore";

/** 등록된 배경의 앞면 · 뒷면 사진 (같은 주소에서 받아야 브라우저가 PDF 로 만들 때 그림을 읽을 수 있음) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; side: string }> }) {
  await connection();
  const { id, side } = await params;
  if (!isSide(side)) return new Response("잘못된 요청이에요.", { status: 400 });
  try {
    const res = await getImage(id, side);
    if (!res?.body) return new Response("사진을 찾지 못했어요.", { status: 404 });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        // 등록한 사진은 바뀌지 않으므로 오래 두어도 됨
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response("사진을 불러오지 못했어요.", { status: 500 });
  }
}
