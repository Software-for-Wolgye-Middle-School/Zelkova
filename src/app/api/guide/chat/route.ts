import { isAuthed } from "@/lib/auth";
import { readGuide } from "@/lib/guideStore";
import { DEFAULT_GUIDE } from "@/lib/serviceGuide";
import { makePseudonymizer, type Pseudonymizer } from "@/lib/pseudonym";
import { readStudents } from "@/lib/studentStore";

/**
 * 사회복무요원 업무 안내 챗봇: 앱에서 저장한 업무 안내(인수인계) 전체와 학생 소개, 등록된 학생 정보를 함께 Google Gemini 에 보내 답을 받음.
 * (질문과 관련된 조각만 골라 보내는 RAG 는 여러 섹션에 걸친 내용을 빠뜨려서 쓰지 않음)
 * 학생 정보를 쓰므로 로그인한 사람만 쓸 수 있고, Gemini API 키(GEMINI_API_KEY)는 서버에만 둠.
 * 학생 실명은 Gemini 에 보내지 않음: 보내는 글(안내 · 학생 소개 · 학생 목록 · 대화)의 이름을 "학생A" 같은 이름표로 바꾸고,
 * 받은 답의 이름표를 서버에서 다시 이름으로 되돌림 (lib/pseudonym.ts)
 */

const NO_STORE = { "Cache-Control": "no-store" };
// 무료 사용량을 넉넉히 쓰려고 가벼운 Flash-Lite 를 씀 (GEMINI_MODEL 로 바꿀 수 있음)
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
/**
 * 답하기 전 '생각'은 출력 한도를 써서 답이 끊길 수 있으므로 가볍게: Gemini 3 부터는 thinkingLevel, 2.x 는 thinkingBudget
 */
const THINKING = /^gemini-2\./.test(MODEL) ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
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

async function systemPrompt(): Promise<{ prompt: string; names: Pseudonymizer }> {
  const [students, guide] = await Promise.all([readStudents(), readGuide()]);
  const names = makePseudonymizer(
    students.map((s) => s.name),
    guide.students,
  );
  const guideText = guide.text || DEFAULT_GUIDE;
  const list = students.length
    ? students.map((s) => `- ${s.grade}학년 ${s.cls}반 ${s.name}${s.subjects.length ? ` (특수학급에서 듣는 과목: ${s.subjects.join(", ")})` : ""}`).join("\n")
    : "(아직 등록된 학생이 없어요)";
  const intro = guide.students.trim() || "(아직 학생 소개가 등록되지 않았어요)";
  const prompt = `너는 중학교 특수학급(느티나무반)에 새로 온 사회복무요원을 돕는 친절한 업무 안내 도우미야.
아래 [업무 안내], [학생 소개], [학생 목록]만 근거로, 한국어 존댓말(~해요체)로 짧고 쉽게 답해.
- 모르는 내용이나 자료에 없는 내용은 지어내지 말고 "담당 선생님께 확인해 주세요"라고 안내해.
- 학생의 장애나 건강 같은 민감한 내용은 추측하지 마.
- 필요하면 목록(•)을 써서 단계별로 알려 줘.
- "학생들에 대해 알려 줘"처럼 학생이 어떤 아이인지 물으면 [학생 소개]를 바탕으로 학년별로 묶어
  "학년-반 이름" 다음에 성격 · 좋아하는 것 · 취미를 친근하게 소개해. 학생과 친해지는 데 도움이 될 대화 소재도 한두 개 곁들이면 좋아.
  이때 특수학급에서 듣는 과목은 말하지 마 (시간표 · 수업 · 과목을 물을 때만 [학생 목록]의 과목을 알려 줘).
- [학생 소개]에 있는 링크(주소)는 그대로 적어 줘.
- "학생A", "학생B" 같은 이름표는 학생 이름 대신 쓴 것이니 답에서도 바꾸지 말고 그대로 써 줘 ("학생A는", "학생B가"처럼).

[업무 안내]
${guideText}

[학생 소개]
${intro}

[학생 목록]
${list}`;
  return { prompt: names.hide(prompt), names };
}

export async function POST(request: Request) {
  if (!isAuthed(request)) return fail("로그인이 필요해요.", 401);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail("Gemini API 키가 아직 설정되지 않았어요. 서버 환경 변수 GEMINI_API_KEY 를 넣어 주세요.", 503);

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const turns = cleanTurns(body?.messages);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return fail("질문을 적어 주세요.", 400);

  try {
    const { prompt, names } = await systemPrompt();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: names.hide(t.text) }] })),
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
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    const text = raw ? names.reveal(raw) : raw;
    if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") console.warn("Gemini 답이 출력 한도에서 잘렸어요.");
    if (!text) return fail("Gemini 가 답을 만들지 못했어요. 질문을 바꿔 다시 해 주세요.", 502);
    return Response.json({ text }, { headers: NO_STORE });
  } catch (e) {
    console.error(e);
    return fail("Gemini 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.", 502);
  }
}
