import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPrompt, parseRequest } from "@/lib/promiseBoard";

/**
 * 나와의 약속판 생성: Gemini 이미지 모델에 참고 이미지(public/templates/promise-board-reference.*)와
 * 이름 · 날짜를 담은 프롬프트를 보내 같은 형식의 약속판 이미지를 받아 돌려줍니다.
 * API 키(GEMINI_API_KEY)는 서버에서만 사용하며 브라우저로 보내지 않습니다.
 */

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3-pro-image";
const REFERENCES = [
  ["promise-board-reference.png", "image/png"],
  ["promise-board-reference.jpg", "image/jpeg"],
  ["promise-board-reference.jpeg", "image/jpeg"],
  ["promise-board-reference.webp", "image/webp"],
] as const;

export const maxDuration = 120;

async function loadReference() {
  for (const [file, mime] of REFERENCES) {
    try {
      const buf = await readFile(path.join(process.cwd(), "public", "templates", file));
      return { mime, data: buf.toString("base64") };
    } catch {
      // 다음 확장자 확인
    }
  }
  return null;
}

/** 응답 모양이 바뀌어도 찾을 수 있도록 마지막 이미지 데이터를 재귀적으로 찾음 */
function findImage(node: unknown): { data: string; mime: string } | null {
  let found: { data: string; mime: string } | null = null;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === "string") {
      found = { data: inline.data, mime: String(inline.mimeType ?? inline.mime_type ?? "image/png") };
    } else if (o.type === "image" && typeof o.data === "string") {
      found = { data: o.data, mime: String(o.mime_type ?? o.mimeType ?? "image/png") };
    }
    Object.values(o).forEach(visit);
  };
  visit(node);
  return found;
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fail(
      503,
      "Gemini API 키가 설정되지 않았어요. 프로젝트 폴더의 .env.local 파일에 GEMINI_API_KEY 를 넣고 서버를 다시 시작해 주세요.",
    );
  }

  const parsed = parseRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return fail(400, parsed);

  const reference = await loadReference();
  const input: Record<string, unknown>[] = [{ type: "text", text: buildPrompt(parsed, !!reference) }];
  if (reference) input.push({ type: "image", mime_type: reference.mime, data: reference.data });

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL,
        input,
        response_format: { type: "image", mime_type: "image/png", aspect_ratio: "3:4", image_size: "2K" },
      }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return fail(504, timeout ? "그림을 그리는 데 너무 오래 걸렸어요. 잠시 후 다시 시도해 주세요." : "Gemini 서버에 연결하지 못했어요.");
  }

  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    console.error("Gemini error", res.status, body?.error?.message);
    if (res.status === 400 && /api key/i.test(body?.error?.message ?? "")) {
      return fail(502, "Gemini API 키가 올바르지 않아요. .env.local 의 GEMINI_API_KEY 를 확인해 주세요.");
    }
    if (res.status === 401 || res.status === 403) return fail(502, "Gemini API 키에 이 모델을 쓸 권한이 없어요.");
    if (res.status === 429) return fail(429, "Gemini 사용량 한도에 도달했어요. 잠시 후 다시 시도해 주세요.");
    return fail(502, "Gemini가 약속판을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const image = findImage(body);
  if (!image) return fail(502, "Gemini 응답에 그림이 없어요. 다시 생성해 주세요.");
  return Response.json({ image: image.data, mimeType: image.mime, usedReference: !!reference });
}
