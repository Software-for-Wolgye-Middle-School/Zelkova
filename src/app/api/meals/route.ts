import { connection } from "next/server";
import { findMonthlyMealLink } from "@/lib/mealNotice";

/** 이번 달 급식 안내 가정통신문의 링크 (저장하지 않고 물어볼 때마다 학교 홈페이지에서 새로 검색) */
export async function GET() {
  await connection(); // 빌드할 때 학교 홈페이지에 접속하지 않도록
  try {
    return Response.json({ link: await findMonthlyMealLink() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "월계중학교 홈페이지에서 급식 안내를 찾지 못했어요." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
