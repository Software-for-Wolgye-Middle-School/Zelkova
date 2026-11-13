import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_FIELDS,
  mergeField,
  metaFromFields,
  sanitizeFields,
  VALUE_MAX,
  type IepFields,
  type IepMeta,
  type IepPresence,
} from "@/lib/iep";

/**
 * 개별화교육계획 저장소 (서버 전용). 다른 저장소와 같이 Upstash Redis 환경 변수가 있으면 거기에, 없으면 서버 디스크 파일에 저장함.
 *
 * 실시간 동시 편집을 위해 칸마다 따로 저장하고, 고칠 때마다 문서의 판 번호(rev)를 하나씩 올려 칸에 적어 둠.
 * 브라우저는 "마지막으로 본 판 번호 이후에 바뀐 칸"만 받아 가므로 1초마다 물어봐도 가벼움.
 * 칸을 쓸 때는 "내가 읽은 값이 아직 그대로일 때만 쓰기"를 한 번에(원자적으로) 하고, 그 사이 다른 사람이 고쳤으면
 * 다시 읽어 합친 뒤(merge3) 다시 씀. 그래서 두 사람이 같은 순간 같은 칸을 고쳐도 한쪽 내용이 사라지지 않음.
 */

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redisOn = () => !!(REDIS_URL && REDIS_TOKEN);
const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "iep.json");

const MAX_DOCS = 500;
/** 이 시간 동안 소식이 없으면 문서를 떠난 것으로 봄 */
const PRESENCE_MS = 12_000;

const K = {
  index: "zelkova:iep:index",
  rev: (id: string) => `zelkova:iep:${id}:rev`,
  values: (id: string) => `zelkova:iep:${id}:values`,
  revs: (id: string) => `zelkova:iep:${id}:revs`,
  presence: (id: string) => `zelkova:iep:${id}:presence`,
};

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  const data = (await res.json()) as { result?: unknown; error?: string }[] | { error?: string };
  if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string }).error ?? `Redis ${res.status}`);
  return data.map((d) => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}

/** HGETALL 결과([k1, v1, k2, v2 …])를 객체로 */
const pairs = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = String(v[i + 1]);
  return out;
};

/** 지금 값이 기대한 값과 같을 때만 쓰고 판 번호를 올림. 다르면 지금 값을 돌려줌 */
const CAS_SCRIPT = `
local cur = redis.call('HGET', KEYS[2], ARGV[1]) or ''
if cur ~= ARGV[3] then return {0, cur} end
local r = redis.call('INCR', KEYS[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[3], ARGV[1], r)
return {r, ARGV[2]}
`;

// ---------------------------------------------------------------- 파일 저장 (Redis 가 없을 때, 서버 한 대)

type FileDoc = { rev: number; values: IepFields; revs: Record<string, number> };
type FileData = { index: Record<string, IepMeta>; docs: Record<string, FileDoc> };

let cache: FileData | null = null;
async function loadFile(): Promise<FileData> {
  if (cache) return cache;
  try {
    const data = JSON.parse(await readFile(FILE, "utf8")) as Partial<FileData>;
    cache = { index: data.index ?? {}, docs: data.docs ?? {} };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    cache = { index: {}, docs: {} };
  }
  return cache;
}

let writing: Promise<void> = Promise.resolve();
let dirty = false;
/** 디스크에는 잠깐 모았다가 한 번에 씀 (1초마다 오는 저장마다 파일 전체를 쓰지 않도록) */
function flushFile() {
  if (dirty) return;
  dirty = true;
  writing = writing.then(async () => {
    await new Promise((r) => setTimeout(r, 300));
    dirty = false;
    const body = JSON.stringify(cache);
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, FILE);
  }).catch((e) => console.error(e));
}

const filePresence = new Map<string, Map<string, IepPresence & { at: number }>>();

// ---------------------------------------------------------------- 공개 함수

const readMeta = (v: unknown): IepMeta | null => {
  try {
    const m = (typeof v === "string" ? JSON.parse(v) : v) as IepMeta;
    return m && typeof m.id === "string" ? m : null;
  } catch {
    return null;
  }
};

/** 모든 문서 요약 (최근에 고친 것부터) */
export async function listDocs(): Promise<IepMeta[]> {
  let metas: IepMeta[];
  if (redisOn()) {
    const [all] = await pipeline([["HGETALL", K.index]]);
    metas = Object.values(pairs(all)).map(readMeta).filter((m): m is IepMeta => !!m);
  } else {
    metas = Object.values((await loadFile()).index);
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createDoc(id: string, fields: IepFields, by: string): Promise<IepMeta> {
  const clean = sanitizeFields(fields);
  const now = Date.now();
  const meta: IepMeta = { id, ...metaFromFields(clean), createdAt: now, updatedAt: now, updatedBy: by };
  const entries = Object.entries(clean);
  if (redisOn()) {
    const [count] = await pipeline([["HLEN", K.index]]);
    if (Number(count) >= MAX_DOCS) throw new Error("문서를 더 만들 수 없어요.");
    const cmds: (string | number)[][] = [["SET", K.rev(id), 1]];
    if (entries.length) {
      cmds.push(["HSET", K.values(id), ...entries.flat()]);
      cmds.push(["HSET", K.revs(id), ...entries.flatMap(([k]) => [k, 1])]);
    }
    cmds.push(["HSET", K.index, id, JSON.stringify(meta)]);
    await pipeline(cmds);
  } else {
    const data = await loadFile();
    if (Object.keys(data.index).length >= MAX_DOCS) throw new Error("문서를 더 만들 수 없어요.");
    data.docs[id] = { rev: 1, values: clean, revs: Object.fromEntries(entries.map(([k]) => [k, 1])) };
    data.index[id] = meta;
    flushFile();
  }
  return meta;
}

export async function deleteDoc(id: string) {
  if (redisOn()) {
    await pipeline([["DEL", K.rev(id), K.values(id), K.revs(id), K.presence(id)], ["HDEL", K.index, id]]);
  } else {
    const data = await loadFile();
    delete data.docs[id];
    delete data.index[id];
    filePresence.delete(id);
    flushFile();
  }
}

export type Change = { key: string; base: string; value: string };
export type SyncResult =
  | { gone: true }
  | {
      gone: false;
      rev: number;
      /** since 이후에 바뀐 칸 (since 가 0 이면 모든 칸) */
      fields: IepFields;
      /** 내가 보낸 칸이 합쳐져 저장된 값 */
      applied: IepFields;
      presence: IepPresence[];
    };

/** 바꾼 칸들을 저장하고, 내가 보고 있는 칸을 알리고, since 이후 다른 사람이 바꾼 칸과 지금 보고 있는 사람들을 돌려줌 */
export async function syncDoc(id: string, since: number, changes: Change[], me: IepPresence): Promise<SyncResult> {
  const now = Date.now();
  const applied: IepFields = {};

  if (redisOn()) {
    const [exists] = await pipeline([["HEXISTS", K.index, id]]);
    if (Number(exists) !== 1) return { gone: true };

    if (changes.length) {
      const [len, ...currents] = await pipeline([["HLEN", K.values(id)], ...changes.map((c) => ["HGET", K.values(id), c.key])]);
      let fieldCount = Number(len);
      for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        let current = (currents[i] as string | null) ?? "";
        if (current === "" && fieldCount >= MAX_FIELDS) continue;
        // 다른 사람이 그 사이에 또 고쳤으면 다시 합쳐서 씀 (몇 번이면 충분함)
        for (let attempt = 0; attempt < 6; attempt++) {
          const value = mergeField(c.key, c.base, c.value, current).slice(0, VALUE_MAX);
          const [res] = await pipeline([["EVAL", CAS_SCRIPT, 3, K.rev(id), K.values(id), K.revs(id), c.key, value, current]]);
          const [ok, latest] = res as [number, string];
          if (Number(ok) > 0) {
            applied[c.key] = value;
            if (current === "") fieldCount++;
            break;
          }
          current = latest ?? "";
        }
      }
    }

    const metaCmds: (string | number)[][] = [];
    const presenceRaw = JSON.stringify({ ...me, at: now });
    const [rev, revsAll, presAll, metaRaw] = await pipeline([
      ["GET", K.rev(id)],
      ["HGETALL", K.revs(id)],
      ["HGETALL", K.presence(id)],
      ["HGET", K.index, id],
      ["HSET", K.presence(id), me.id, presenceRaw],
      ["EXPIRE", K.presence(id), 120],
    ]);
    // 반드시 판 번호를 먼저 읽고 칸 번호를 읽어야 빠뜨리는 칸이 없음 (위 pipeline 순서)
    const revNum = Number(rev) || 0;
    const changedKeys = Object.entries(pairs(revsAll))
      .filter(([, r]) => Number(r) > since)
      .map(([k]) => k);
    const fields: IepFields = {};
    if (changedKeys.length) {
      const [vals] = await pipeline([["HMGET", K.values(id), ...changedKeys]]);
      changedKeys.forEach((k, i) => {
        const v = (vals as (string | null)[])[i];
        if (v !== null && v !== undefined) fields[k] = v;
      });
    }
    // 목록 요약 고치기 (내가 바꾼 것이 있을 때만)
    const meta = readMeta(metaRaw);
    if (meta && Object.keys(applied).length) {
      const next = { ...meta, ...pickMeta(meta, applied), updatedAt: now, updatedBy: me.name };
      metaCmds.push(["HSET", K.index, id, JSON.stringify(next)]);
    }
    const stale = Object.entries(pairs(presAll)).filter(([, v]) => presenceAt(v) < now - PRESENCE_MS);
    if (stale.length) metaCmds.push(["HDEL", K.presence(id), ...stale.map(([k]) => k)]);
    if (metaCmds.length) await pipeline(metaCmds);

    return { gone: false, rev: revNum, fields, applied, presence: livePresence(pairs(presAll), me.id, now) };
  }

  // 파일 저장: 한 프로세스 안에서 바로 처리 (await 사이에 끼어드는 요청이 없도록 동기적으로 바꿈)
  const data = await loadFile();
  const doc = data.docs[id];
  const meta = data.index[id];
  if (!doc || !meta) return { gone: true };
  for (const c of changes) {
    const current = doc.values[c.key] ?? "";
    if (!(c.key in doc.values) && Object.keys(doc.values).length >= MAX_FIELDS) continue;
    const value = mergeField(c.key, c.base, c.value, current).slice(0, VALUE_MAX);
    if (value !== current || !(c.key in doc.values)) {
      doc.rev++;
      doc.values[c.key] = value;
      doc.revs[c.key] = doc.rev;
    }
    applied[c.key] = value;
  }
  if (changes.length) {
    data.index[id] = { ...meta, ...pickMeta(meta, applied), updatedAt: now, updatedBy: me.name };
    flushFile();
  }
  const fields: IepFields = {};
  for (const [k, r] of Object.entries(doc.revs)) if (r > since) fields[k] = doc.values[k] ?? "";

  let room = filePresence.get(id);
  if (!room) filePresence.set(id, (room = new Map()));
  room.set(me.id, { ...me, at: now });
  const raw: Record<string, string> = {};
  for (const [k, p] of room) {
    if (p.at < now - PRESENCE_MS) room.delete(k);
    else raw[k] = JSON.stringify(p);
  }
  return { gone: false, rev: doc.rev, fields, applied, presence: livePresence(raw, me.id, now) };
}

/** 바뀐 칸 중 목록 요약에 들어가는 것 */
const pickMeta = (meta: IepMeta, applied: IepFields): Partial<IepMeta> =>
  metaFromFields({ year: meta.year, semester: meta.semester, grade: meta.grade, classNo: meta.cls, name: meta.name, ...applied });

function presenceAt(v: string): number {
  try {
    return Number((JSON.parse(v) as { at?: unknown }).at) || 0;
  } catch {
    return 0;
  }
}

function livePresence(raw: Record<string, string>, myId: string, now: number): IepPresence[] {
  const out: IepPresence[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k === myId) continue;
    try {
      const p = JSON.parse(v) as IepPresence & { at: number };
      if (p.at >= now - PRESENCE_MS) out.push({ id: k, name: String(p.name).slice(0, 20), color: String(p.color), field: String(p.field ?? "") });
    } catch {
      // 깨진 값은 건너뜀
    }
  }
  return out;
}
