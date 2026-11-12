import { isAuthed } from "@/lib/auth";
import { retrieveGuide } from "@/lib/guideRag";
import { readGuide } from "@/lib/guideStore";
import { DEFAULT_GUIDE } from "@/lib/serviceGuide";
import { readStudents } from "@/lib/studentStore";

/**
 * 사회복무요원 업무 안내 챗봇: 앱에서 저장한 업무 안내(인수인계) 가운데 질문과 관련된 조각만(RAG) 골라
 * 등록된 학생 정보와 함께 Google Gemini 에 보내 답을 받음.
 * 학생 정보를 쓰므로 로그인한 사람만 쓸 수 있고, Gemini API 키(GEMINI_API_KEY)는 서버에만 둠
 */

const NO_STORE = { "Cache-Control": "no-store" };
// 무료 사용량을 넉넉히 쓰려고 가벼운 Flash-Lite 를 씀 (GEMINI_MODEL 로 바꿀 수 있음)
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
/**
 * 답하기 전 '생각'은 출력 한도를 써서 답이 끊길 수 있으므로 가볍게: Gemini 3 부터는 thinkingLevel, 2.x 는 thinkingBudget
 */
const THINKING = /^gemini-2\./.test(MODEL) ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
/** 대화가 길어져도 최근 것만 보냄 (보내는 양을 줄이려고 짧게) */
const MAX_TURNS = 6;
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

/** query: 업무 안내에서 관련 조각을 찾을 때 쓰는 질문 */
async function systemPrompt(key: string, query: string) {
  const [students, guide] = await Promise.all([readStudents(), readGuide()]);
  // 업무 안내에서 질문과 관련된 부분만 고름 (임베딩을 못 하면 전체를 씀)
  const guideText = guide.text ? ((await retrieveGuide(key, guide.text, query)) ?? guide.text) : DEFAULT_GUIDE;
  const list = students.length
    ? students.map((s) => `- ${s.grade}학년 ${s.cls}반 ${s.name}${s.subjects.length ? ` (특수학급에서 듣는 과목: ${s.subjects.join(", ")})` : ""}`).join("\n")
    : "(아직 등록된 학생이 없어요)";
  return `너는 중학교 특수학급(느티나무반)에 새로 온 사회복무요원을 돕는 친절한 업무 안내 도우미야.
아래 [업무 안내](질문과 관련된 부분만 골라 둔 것)와 [학생 목록]만 근거로, 한국어 존댓말(~해요체)로 짧고 쉽게 답해.
- 모르는 내용이나 자료에 없는 내용은 지어내지 말고 "담당 선생님께 확인해 주세요"라고 안내해.
- 학생의 장애나 건강 같은 민감한 내용은 추측하지 마.
- 필요하면 목록(•)을 써서 단계별로 알려 줘.

[업무 안내]
${guideText}

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

  // 이어지는 질문("그럼 걔는?")도 찾을 수 있게 최근 질문 두 개를 함께 검색어로 씀
  const ragQuery = turns
    .filter((t) => t.role === "user")
    .slice(-2)
    .map((t) => t.text)
    .join("\n");

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: await systemPrompt(key, ragQuery) }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192, thinkingConfig: THINKING },
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      console.error("Gemini", res.status, data?.error?.message);
      // 무료 등급은 하루 요청 수가 정해져 있어 다 쓰면 다음 날까지 막힘
      if (res.status === 429) return fail("오늘 쓸 수 있는 Gemini 사용량을 모두 썼어요. 내일 다시 물어봐 주세요.", 429);
      // 원인을 바로 알 수 있게 Gemini 가 준 상태 코드와 이유를 함께 보여 줌 (로그인한 사람만 보는 화면)
      const reason = data?.error?.message?.split("\n")[0]?.slice(0, 200);
      return fail(`Gemini 에서 답을 받지 못했어요. (${res.status}${reason ? `: ${reason}` : ""})`, 502);
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
