import { isAuthed } from "@/lib/auth";
import { readGuide } from "@/lib/guideStore";
import { DEFAULT_GUIDE } from "@/lib/serviceGuide";
import { readStudents } from "@/lib/studentStore";

/**
 * 사회복무요원 업무 안내 챗봇: 앱에서 저장한 업무 안내(인수인계)와 등록된 학생 정보를 바탕으로 Google Gemini 가 답함.
 * 학생 정보를 쓰므로 로그인한 사람만 쓸 수 있고, Gemini API 키(GEMINI_API_KEY)는 서버에만 둠
 */

const NO_STORE = { "Cache-Control": "no-store" };
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
/** 대화가 길어져도 최근 것만 보냄 */
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

type Turn = { role: "user" | "model"; text: string };

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

function cleanTurns(input: unknown): Turn[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t): t is Turn => !!t && (t.role === "user" || t.role === "model") && typeof t.text === "string" && t.text.trim() !== "")
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_CHARS) }));
}

async function systemPrompt() {
  const [students, guide] = await Promise.all([readStudents(), readGuide()]);
  const list = students.length
    ? students.map((s) => `- ${s.grade}학년 ${s.cls}반 ${s.name}${s.subjects.length ? ` (특수학급에서 듣는 과목: ${s.subjects.join(", ")})` : ""}`).join("\n")
    : "(아직 등록된 학생이 없어요)";
  return `너는 중학교 특수학급(느티나무반)에 새로 온 사회복무요원을 돕는 친절한 업무 안내 도우미야.
아래 [업무 안내]와 [학생 목록]만 근거로, 한국어 존댓말(~해요체)로 짧고 쉽게 답해.
- 모르는 내용이나 자료에 없는 내용은 지어내지 말고 "담당 선생님께 확인해 주세요"라고 안내해.
- 학생의 장애나 건강 같은 민감한 내용은 추측하지 마.
- 필요하면 목록(•)을 써서 단계별로 알려 줘.

[업무 안내]
${guide.text || DEFAULT_GUIDE}

[학생 목록]
${list}`;
}

export async function POST(request: Request) {
  if (!isAuthed(request)) return fail("로그인이 필요해요.", 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail("Gemini API 키가 아직 설정되지 않았어요. 서버 환경 변수 GEMINI_API_KEY 를 넣어 주세요.", 503);

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const turns = cleanTurns(body?.messages);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return fail("질문을 적어 주세요.", 400);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: await systemPrompt() }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        // 2.5 Flash 는 답하기 전에 '생각'하는 토큰도 출력 한도에서 써서 답이 중간에 끊겼음 → 생각은 끄고 한도를 넉넉히
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      console.error("Gemini", res.status, data?.error?.message);
      return fail("Gemini 에서 답을 받지 못했어요. 잠시 뒤 다시 해 주세요.", 502);
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") console.warn("Gemini 답이 출력 한도에서 잘렸어요.");
    if (!text) return fail("Gemini 가 답을 만들지 못했어요. 질문을 바꿔 다시 해 주세요.", 502);
    return Response.json({ text }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return fail("Gemini 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.", 502);
  }
}
