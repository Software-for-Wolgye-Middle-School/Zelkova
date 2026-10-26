import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { fetchMealNotices } from "@/lib/mealNotice";

/** 학교 홈페이지는 달에 한 번 글이 올라오므로 한 시간마다만 다시 읽음 */
async function recentMealNotices() {
  "use cache";
  cacheLife("hours");
  return fetchMealNotices(3);
}

export async function GET() {
  await connection(); // 빌드할 때 학교 홈페이지에 접속하지 않도록
  try {
    return Response.json({ notices: await recentMealNotices() });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "월계중학교 홈페이지에서 급식 안내를 가져오지 못했어요." }, { status: 502 });
  }
}
