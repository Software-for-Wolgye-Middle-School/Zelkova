import { createHash } from "node:crypto";
import { kv } from "@/lib/kv";

/** 로그인처럼 마구 시도하면 안 되는 요청의 횟수 제한 (IP 당 5분에 10번, 서버 전용) */

export class TooManyRequests extends Error {}

export const clientIp = (request: Request) =>
  (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);

/** 제한을 넘으면 TooManyRequests 를 던짐 (IP 는 해시로만 저장하고 5분 뒤 사라짐) */
export async function rateLimit(request: Request, scope: string, limit = 10, seconds = 300) {
  const key = `zelkova:rl:${scope}:${createHash("sha256").update(clientIp(request)).digest("base64url").slice(0, 22)}`;
  const [n] = (await kv(["INCR", key], ["EXPIRE", key, seconds])) as [number];
  if (Number(n) > limit) throw new TooManyRequests("너무 여러 번 시도했어요. 5분 뒤에 다시 해 주세요.");
}
