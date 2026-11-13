import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cleanCursor,
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

/**
 * 한 번 주고받기 (개별화교육계획 실시간 편집). 문서가 있는지 확인 → 읽은 값이 그대로인 칸만 쓰기(판 번호 올림) →
 * 내 위치 알리기 → since 이후 바뀐 칸 · 지금 보고 있는 사람 읽기를 한꺼번에(원자적으로) 함.
 * 돌려주는 것: {'ok', 판 번호, 쓴 칸[k,v…], 그 사이 바뀌어 못 쓴 칸[k,지금값…], 바뀐 칸[k,v…], 보고 있는 사람[json…], 목록 요약}
 */
const SYNC_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return {'gone'} end
local changes = cjson.decode(ARGV[7])
local maxFields = tonumber(ARGV[8])
local count = redis.call('HLEN', KEYS[3])
local applied, conflicts = {}, {}
for _, c in ipairs(changes) do
  local cur = redis.call('HGET', KEYS[3], c[1])
  local isNew = (cur == false)
  if isNew then cur = '' end
  if not (isNew and count >= maxFields) then
    if cur == c[2] then
      local r = redis.call('INCR', KEYS[2])
      redis.call('HSET', KEYS[3], c[1], c[3])
      redis.call('HSET', KEYS[4], c[1], r)
      if isNew then count = count + 1 end
      table.insert(applied, c[1]); table.insert(applied, c[3])
    else
      table.insert(conflicts, c[1]); table.insert(conflicts, cur)
    end
  end
end
redis.call('HSET', KEYS[5], ARGV[3], ARGV[4])
redis.call('EXPIRE', KEYS[5], 120)
local rev = tonumber(redis.call('GET', KEYS[2]) or '0')
local since = tonumber(ARGV[2])
local fields = {}
if rev > since then
  local revs = redis.call('HGETALL', KEYS[4])
  for i = 1, #revs, 2 do
    if tonumber(revs[i + 1]) > since then
      local v = redis.call('HGET', KEYS[3], revs[i])
      if v then table.insert(fields, revs[i]); table.insert(fields, v) end
    end
  end
end
local live = {}
local pres = redis.call('HGETALL', KEYS[5])
local stale = tonumber(ARGV[6])
for i = 1, #pres, 2 do
  local ok, p = pcall(cjson.decode, pres[i + 1])
  if ok and type(p) == 'table' and tonumber(p.at) and tonumber(p.at) >= stale then
    if pres[i] ~= ARGV[3] then table.insert(live, pres[i + 1]) end
  else
    redis.call('HDEL', KEYS[5], pres[i])
  end
end
local meta = ''
if #applied > 0 then meta = redis.call('HGET', KEYS[1], ARGV[1]) or '' end
return {'ok', rev, applied, conflicts, fields, live, meta}
`;

// ---------------------------------------------------------------- 파일 저장 (Redis 가 없을 때, 서버 한 대)

type FileDoc = { rev: number; values: IepFields; revs: Record<string, number> };
type FileData = { index: Record<string, IepMeta>; docs: Record<string, FileDoc> };

/**
 * 메모리에 올린 파일 내용은 서버 프로세스 하나에 하나만: API 라우트마다 이 파일이 따로 불러와져도(개발 서버 등)
 * 같은 내용을 보도록 globalThis 에 둠
 */
type Shared = { cache: FileData | null; loading: Promise<FileData> | null; writing: Promise<void>; dirty: boolean; presence: Map<string, Map<string, IepPresence & { at: number }>> };
const shared: Shared = ((globalThis as { __zelkovaIep?: Shared }).__zelkovaIep ??= {
  cache: null,
  loading: null,
  writing: Promise.resolve(),
  dirty: false,
  presence: new Map(),
});

async function loadFile(): Promise<FileData> {
  if (shared.cache) return shared.cache;
  shared.loading ??= (async () => {
    try {
      const data = JSON.parse(await readFile(FILE, "utf8")) as Partial<FileData>;
      return { index: data.index ?? {}, docs: data.docs ?? {} };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return { index: {}, docs: {} };
    }
  })().finally(() => (shared.loading = null));
  const data = await shared.loading;
  shared.cache ??= data;
  return shared.cache;
}

/** 디스크에는 잠깐 모았다가 한 번에 씀 (1초마다 오는 저장마다 파일 전체를 쓰지 않도록) */
function flushFile() {
  if (shared.dirty) return;
  shared.dirty = true;
  shared.writing = shared.writing.then(async () => {
    await new Promise((r) => setTimeout(r, 300));
    shared.dirty = false;
    const body = JSON.stringify(shared.cache);
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, FILE);
  }).catch((e) => console.error(e));
}

const filePresence = shared.presence;

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
    // 한 번 주고받는 일 전체를 스크립트 하나로 (Upstash 는 스크립트 하나를 명령 1개로 셈)
    const res = (await pipeline([
      [
        "EVAL",
        SYNC_SCRIPT,
        5,
        K.index,
        K.rev(id),
        K.values(id),
        K.revs(id),
        K.presence(id),
        id,
        since,
        me.id,
        JSON.stringify({ ...me, at: now }),
        now - PRESENCE_MS,
        JSON.stringify(changes.map((c) => [c.key, c.base, c.value.slice(0, VALUE_MAX)])),
        MAX_FIELDS,
      ],
    ]))[0] as unknown[];
    if (res[0] !== "ok") return { gone: true };
    const [, rev, appliedRaw, conflictRaw, fieldsRaw, liveRaw, metaRaw] = res as [string, number, string[], string[], string[], string[], string];
    Object.assign(applied, pairs(appliedRaw));

    // 다른 사람이 그 사이 같은 칸을 고쳤으면 합쳐서 다시 씀 (드문 경우)
    const conflicts = pairs(conflictRaw);
    for (const c of changes) {
      if (!(c.key in conflicts)) continue;
      let current = conflicts[c.key];
      for (let attempt = 0; attempt < 6; attempt++) {
        const value = mergeField(c.key, c.base, c.value, current).slice(0, VALUE_MAX);
        const [r] = await pipeline([["EVAL", CAS_SCRIPT, 3, K.rev(id), K.values(id), K.revs(id), c.key, value, current]]);
        const [ok, latest] = r as [number, string];
        if (Number(ok) > 0) {
          applied[c.key] = value;
          break;
        }
        current = latest ?? "";
      }
    }

    const fields = pairs(fieldsRaw);
    for (const [k, v] of Object.entries(applied)) fields[k] = v;
    // 목록 요약은 이름 · 학년도 같은 요약 칸이 바뀌었거나 1분 넘게 지났을 때만 고침 (명령 수를 아끼려고)
    const meta = readMeta(metaRaw || null);
    if (meta && Object.keys(applied).length) {
      const next = { ...meta, ...pickMeta(meta, applied), updatedAt: now, updatedBy: me.name };
      const summaryChanged = (["year", "semester", "grade", "cls", "name", "updatedBy"] as const).some((k) => next[k] !== meta[k]);
      if (summaryChanged || now - meta.updatedAt > 60_000) await pipeline([["HSET", K.index, id, JSON.stringify(next)]]);
    }
    const presence = livePresence(Object.fromEntries(liveRaw.map((v, i) => [`p${i}`, v])), me.id, now);
    return { gone: false, rev: Number(rev) || 0, fields, applied, presence };
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

function livePresence(raw: Record<string, string>, myId: string, now: number): IepPresence[] {
  const out: IepPresence[] = [];
  for (const [k, v] of Object.entries(raw)) {
    try {
      const p = JSON.parse(v) as IepPresence & { at: number };
      const id = typeof p.id === "string" ? p.id : k;
      if (id !== myId && p.at >= now - PRESENCE_MS) out.push({ id, name: String(p.name).slice(0, 20), color: String(p.color), field: String(p.field ?? ""), cursor: cleanCursor(p.cursor) });
    } catch {
      // 깨진 값은 건너뜀
    }
  }
  return out;
}
