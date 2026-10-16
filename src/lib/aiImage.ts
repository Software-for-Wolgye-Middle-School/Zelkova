/**
 * 무료 AI 그림: Pollinations (https://pollinations.ai) — 가입 · API 키 없이 쓸 수 있는 공개 이미지 생성 서비스.
 * 그림 설명(프롬프트)만 보내고, 학생 이름 같은 개인 정보는 보내지 않습니다.
 * 그림 속 한글은 AI가 제대로 쓰지 못하므로, 글자는 그림 위에 코드로 따로 그립니다.
 */

const IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/";
const TEXT_ENDPOINT = "https://text.pollinations.ai/openai";

/** 모든 그림에 공통으로 붙이는 스타일: 템플릿처럼 부드러운 동화책 일러스트, 글자 없음 */
const STYLE =
  "flat 2D vector illustration, kawaii children's picture book style, bright cheerful pastel colors, clean simple shapes, smooth gradients, minimal details, absolutely no text, no letters";

/** 무료 등급은 그림 오른쪽 아래에 로고를 찍으므로, 조금 더 길게 받아 아래 띠를 잘라 냄 */
const WATERMARK_CROP = 0.07;

const hasKorean = (s: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s);

/** 한글 프롬프트를 영어로 옮김 (이미지 모델이 영어를 더 잘 알아들음). 실패하면 원문 그대로 사용 */
export async function toEnglish(prompt: string, signal?: AbortSignal): Promise<string> {
  if (!hasKorean(prompt)) return prompt;
  try {
    const res = await fetch(TEXT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
      body: JSON.stringify({
        model: "openai",
        messages: [
          {
            role: "user",
            content: `Translate this image description into natural English. Output only the translation.\n\n${prompt}`,
          },
        ],
      }),
    });
    if (!res.ok) return prompt;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && !hasKorean(text) ? text.replace(/^["']|["']$/g, "") : prompt;
  } catch (e) {
    if (signal?.aborted) throw e;
    return prompt;
  }
}

export type AiImageRequest = {
  /** 사용자가 적은 그림 설명 (한글 가능) */
  subject: string;
  /** 템플릿 구도 설명 (예: 가운데에 제목 자리를 비워 둠) */
  layout: string;
  width: number;
  height: number;
  seed: number;
};

export const newSeed = () => Math.floor(Math.random() * 1_000_000_000);

/** 무료 등급 제한(같은 인터넷 주소에서 약 45초에 한 장)에 걸렸을 때 기다릴 초. 제한이 아니면 null */
async function limitWait(res: Response): Promise<number | null> {
  if (res.status !== 402 && res.status !== 429) return null;
  const header = Number(res.headers.get("Retry-After"));
  if (header > 0) return header;
  const body = await res.text().catch(() => "");
  if (res.status === 402 && !body.includes("FREE_LIMIT")) return null;
  const sec = Number(body.match(/retry after (\d+)\s*s/i)?.[1]);
  return sec > 0 ? sec : 45;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/**
 * 그림을 받아 data: 주소로 돌려줌 (SVG 안에 넣어 PNG · 인쇄로 내보낼 수 있도록).
 * 무료 등급 제한에 걸리면 onWait 으로 남은 초를 알리며 기다렸다가 다시 시도.
 */
export async function generateAiImage(
  req: AiImageRequest,
  { signal, onWait }: { signal?: AbortSignal; onWait?: (seconds: number) => void } = {},
): Promise<string> {
  const subject = await toEnglish(req.subject.trim(), signal);
  const prompt = `${subject}. ${req.layout}. ${STYLE}`;
  const height = Math.round(req.height / (1 - WATERMARK_CROP));
  const url =
    IMAGE_ENDPOINT +
    encodeURIComponent(prompt) +
    `?width=${req.width}&height=${height}&seed=${req.seed}&nologo=true&private=true`;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]) });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error("AI 그림 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    }
    const wait = await limitWait(res);
    if (wait !== null) {
      if (attempt >= 3) throw new Error("지금 AI 그림 서버가 붐벼요. 1분쯤 뒤에 다시 시도해 주세요.");
      for (let left = Math.min(wait, 60) + 1; left > 0; left--) {
        onWait?.(left);
        await sleep(1000, signal);
      }
      onWait?.(0);
      continue;
    }
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      throw new Error("AI 그림을 만들지 못했어요. 그림 설명을 조금 바꿔 다시 시도해 주세요.");
    }
    return cropBottom(await res.blob(), WATERMARK_CROP);
  }
}

/** 그림 아래쪽 ratio 만큼 잘라 JPEG data: 주소로 */
async function cropBottom(blob: Blob, ratio: number): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = Math.round(bmp.height * (1 - ratio));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.92);
}
