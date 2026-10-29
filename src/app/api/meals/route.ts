import { connection } from "next/server";
import { getMonthlyMealNotice } from "@/lib/mealCache";

export async function GET() {
  await connection(); // 빌드할 때 학교 홈페이지에 접속하지 않도록
  try {
    const notice = await getMonthlyMealNotice();
    return Response.json(
      { notices: notice ? [notice] : [] },
      // 브라우저와 중간 서버에도 잠시 두어 다음 조회가 더 빨라지게 함
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "월계중학교 홈페이지에서 급식 안내를 가져오지 못했어요." }, { status: 502 });
  }
}
