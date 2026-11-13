import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readGuide, writeGuide } from "@/lib/guideStore";

const NO_STORE = { "Cache-Control": "no-store" };
/** 업무 안내 글은 관리자만 보고 고칠 수 있음 (챗봇은 서버 안에서 바로 읽으므로 이 길을 거치지 않음) */
const unauthorized = () => Response.json({ error: "관리자만 업무 안내를 편집할 수 있어요." }, { status: 403, headers: NO_STORE });

export async function GET(request: Request) {
  await connection();
  if (!isAdmin(request)) return unauthorized();
  return Response.json(await readGuide(), { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!isAdmin(request)) return unauthorized();
  const body = (await request.json().catch(() => null)) as { text?: unknown; students?: unknown } | null;
  if (!body || typeof body.text !== "string") return Response.json({ error: "text 가 필요해요." }, { status: 400, headers: NO_STORE });
  try {
    // students 를 보내지 않으면(예전 화면) 저장된 학생 소개를 그대로 둠
    const students = typeof body.students === "string" ? body.students : (await readGuide()).students;
    return Response.json(await writeGuide(body.text, students), { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "업무 안내를 서버에 저장하지 못했어요." }, { status: 500, headers: NO_STORE });
  }
}
