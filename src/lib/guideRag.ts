import { createHash } from "node:crypto";
import { readGuideIndex, writeGuideIndex, type GuideIndex } from "./guideStore";

/**
 * 업무 안내 RAG (서버 전용): 업무 안내를 [제목] 단위 조각으로 나눠 Gemini 임베딩으로 색인해 두고,
 * 질문마다 뜻이 가장 가까운 조각 몇 개만 골라 Gemini 에 보냄 (업무 안내가 길어져도 보내는 양이 늘지 않음).
 * 색인은 업무 안내를 저장할 때 만들고, 글이 바뀌었는데 색인이 옛것이면 질문할 때 다시 만듦.
 */

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
const DIMS = 768;
/** 한 조각의 최대 길이 (넘으면 문단 단위로 더 나눔) */
const CHUNK_MAX = 900;
/** 질문 하나에 보내는 조각 수 */
export const TOP_K = 4;

const API = "https://generativelanguage.googleapis.com/v1beta/models";

const hashOf = (text: string) => createHash("sha256").update(`${EMBED_MODEL}:${DIMS}:${text}`).digest("hex");

/** [제목] 으로 시작하는 섹션 단위로 나누고, 너무 긴 섹션은 빈 줄 기준으로 다시 나눔 (조각마다 섹션 제목을 붙여 뜻이 살게) */
export function chunkGuide(text: string): string[] {
  const sections = text
    .split(/\n(?=\s*\[[^\]\n]+\])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= CHUNK_MAX) {
      chunks.push(section);
      continue;
    }
    const title = section.match(/^\s*(\[[^\]\n]+\])/)?.[1] ?? "";
    let cur = "";
    for (const para of section.split(/\n\s*\n/)) {
      if (cur && cur.length + para.length + 2 > CHUNK_MAX) {
        chunks.push(cur);
        cur = title && !para.startsWith(title) ? `${title} (이어서)\n${para}` : para;
      } else cur = cur ? `${cur}\n\n${para}` : para;
    }
    if (cur) chunks.push(cur);
  }
  return chunks;
}

async function embed(key: string, texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const res = await fetch(`${API}/${EMBED_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      requests: texts.map((text) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text }] }, taskType, outputDimensionality: DIMS })),
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { embeddings?: { values?: number[] }[]; error?: { message?: string } } | null;
  if (!res.ok || !data?.embeddings || data.embeddings.length !== texts.length) {
    throw new Error(`Gemini 임베딩 ${res.status} ${data?.error?.message ?? ""}`);
  }
  return data.embeddings.map((e) => e.values ?? []);
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** 업무 안내 글로 색인을 만들어 저장함 (조각이 아무리 많아도 임베딩 요청은 한 번) */
export async function buildGuideIndex(key: string, text: string): Promise<GuideIndex> {
  const chunks = chunkGuide(text);
  const vecs = chunks.length ? await embed(key, chunks, "RETRIEVAL_DOCUMENT") : [];
  const index: GuideIndex = { hash: hashOf(text), model: EMBED_MODEL, chunks: chunks.map((t, i) => ({ text: t, vec: vecs[i] })) };
  await writeGuideIndex(index);
  return index;
}

/**
 * 질문과 가장 가까운 업무 안내 조각들을 원래 순서대로 이어 돌려줌.
 * 색인이 없거나 옛것이면 먼저 다시 만듦. 임베딩을 못 하면 null (그때는 업무 안내 전체를 씀)
 */
export async function retrieveGuide(key: string, text: string, query: string): Promise<string | null> {
  try {
    let index = await readGuideIndex();
    if (!index || index.hash !== hashOf(text)) index = await buildGuideIndex(key, text);
    if (index.chunks.length <= TOP_K) return index.chunks.map((c) => c.text).join("\n\n");
    const [q] = await embed(key, [query], "RETRIEVAL_QUERY");
    const picked = index.chunks
      .map((c, i) => ({ i, score: cosine(q, c.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      .sort((a, b) => a.i - b.i);
    return picked.map(({ i }) => index.chunks[i].text).join("\n\n");
  } catch (e) {
    console.error(e);
    return null;
  }
}
