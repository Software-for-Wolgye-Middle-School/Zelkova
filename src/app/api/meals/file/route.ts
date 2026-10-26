import type { NextRequest } from "next/server";
import { schoolFileUrl } from "@/lib/meal";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** 가정통신문 첨부 파일을 받아서 그대로 전달 (inline=1 이면 브라우저 안에서 열기) */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const url = schoolFileUrl(params.get("id") ?? "", params.get("sn") ?? "");
  if (!url) return new Response("잘못된 파일 주소입니다.", { status: 400 });

  const name = (params.get("name") ?? "급식 안내").replace(/[\\/:*?"<>|\r\n]/g, "").trim() || "급식 안내";
  const ext = name.split(".").pop()!.toLowerCase();

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("학교 홈페이지에서 파일을 받지 못했어요.", { status: 502 });

  const disposition = params.get("inline") === "1" ? "inline" : "attachment";
  return new Response(res.body, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="meal.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "public, max-age=3600",
      ...(res.headers.get("content-length") ? { "Content-Length": res.headers.get("content-length")! } : {}),
    },
  });
}
