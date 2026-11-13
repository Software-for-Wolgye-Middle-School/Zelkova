import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 소통게시판이 쓰는 작은 키-값 저장소 (서버 전용).
 * 배포(Vercel)에서는 Upstash Redis REST 로 명령을 그대로 보내고, Redis 환경 변수가 없으면(이 컴퓨터에서 개발할 때)
 * 같은 명령을 메모리에서 흉내 내고 data/board.json 파일에 저장함. 쓰는 명령만 흉내 냄.
 */

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const FILE = path.join(process.env.STUDENTS_DATA_DIR ?? path.join(process.cwd(), "data"), "board.json");

export type Cmd = (string | number)[];

/** 명령 여러 개를 차례로 실행하고 결과들을 돌려줌 (Redis 에서는 요청 한 번) */
export async function kv(...commands: Cmd[]): Promise<unknown[]> {
  if (REDIS_URL && REDIS_TOKEN) {
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
  const db = await load();
  const out = commands.map((c) => run(db, c.map(String)));
  save();
  return out;
}

/** 명령 하나 */
export const kv1 = async (...command: Cmd) => (await kv(command))[0];

// ---------------------------------------------------------------- 파일 흉내 (개발용)

type Val = { t: "s"; v: string } | { t: "h"; v: Record<string, string> } | { t: "z"; v: Record<string, number> } | { t: "set"; v: string[] } | { t: "l"; v: string[] };
type Db = { data: Record<string, Val>; exp: Record<string, number> };
type Shared = { db: Db | null; dirty: boolean; writing: Promise<void> };
const shared: Shared = ((globalThis as { __zelkovaKv?: Shared }).__zelkovaKv ??= { db: null, dirty: false, writing: Promise.resolve() });

async function load(): Promise<Db> {
  if (shared.db) return shared.db;
  let db: Db = { data: {}, exp: {} };
  try {
    db = JSON.parse(await readFile(FILE, "utf8")) as Db;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  shared.db ??= db;
  return shared.db;
}

function save() {
  if (shared.dirty) return;
  shared.dirty = true;
  shared.writing = shared.writing
    .then(async () => {
      await new Promise((r) => setTimeout(r, 200));
      shared.dirty = false;
      await mkdir(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(shared.db), "utf8");
      await rename(tmp, FILE);
    })
    .catch((e) => console.error(e));
}

function run(db: Db, [name, key, ...a]: string[]): unknown {
  const now = Date.now();
  if (db.exp[key] && db.exp[key] <= now) {
    delete db.data[key];
    delete db.exp[key];
  }
  const get = <T extends Val["t"]>(t: T) => {
    const v = db.data[key];
    if (v && v.t !== t) throw new Error("WRONGTYPE");
    return v as Extract<Val, { t: T }> | undefined;
  };
  const make = <T extends Val["t"]>(t: T, empty: Extract<Val, { t: T }>["v"]) => (get(t) ?? (db.data[key] = { t, v: empty } as Val)) as Extract<Val, { t: T }>;
  const drop = () => {
    delete db.data[key];
    delete db.exp[key];
  };
  switch (name.toUpperCase()) {
    case "GET":
      return get("s")?.v ?? null;
    case "SET": {
      db.data[key] = { t: "s", v: a[0] };
      delete db.exp[key];
      const ex = a.findIndex((x) => x.toUpperCase() === "EX");
      if (ex >= 0) db.exp[key] = now + Number(a[ex + 1]) * 1000;
      return "OK";
    }
    case "GETDEL": {
      const v = get("s")?.v ?? null;
      drop();
      return v;
    }
    case "DEL": {
      let n = 0;
      for (const k of [key, ...a]) {
        if (!db.data[k]) continue;
        delete db.data[k];
        delete db.exp[k];
        n++;
      }
      return n;
    }
    case "EXPIRE":
      if (!db.data[key]) return 0;
      db.exp[key] = now + Number(a[0]) * 1000;
      return 1;
    case "INCR": {
      const s = get("s");
      const n = Number(s?.v ?? 0) + 1;
      db.data[key] = { t: "s", v: String(n) };
      return n;
    }
    case "HSET": {
      const h = make("h", {});
      let n = 0;
      for (let i = 0; i + 1 < a.length; i += 2) {
        if (!(a[i] in h.v)) n++;
        h.v[a[i]] = a[i + 1];
      }
      return n;
    }
    case "HGET":
      return get("h")?.v[a[0]] ?? null;
    case "HGETALL":
      return Object.entries(get("h")?.v ?? {}).flat();
    case "HEXISTS":
      return a[0] in (get("h")?.v ?? {}) ? 1 : 0;
    case "HLEN":
      return Object.keys(get("h")?.v ?? {}).length;
    case "HMGET":
      return a.map((f) => get("h")?.v[f] ?? null);
    case "HDEL": {
      const h = get("h");
      let n = 0;
      for (const f of a) {
        if (!h || !(f in h.v)) continue;
        delete h.v[f];
        n++;
      }
      if (h && !Object.keys(h.v).length) drop();
      return n;
    }
    case "SADD": {
      const s = make("set", []);
      let n = 0;
      for (const m of a) {
        if (s.v.includes(m)) continue;
        s.v.push(m);
        n++;
      }
      return n;
    }
    case "SREM": {
      const s = get("set");
      if (!s) return 0;
      const before = s.v.length;
      s.v = s.v.filter((m) => !a.includes(m));
      return before - s.v.length;
    }
    case "SMEMBERS":
      return [...(get("set")?.v ?? [])];
    case "SCARD":
      return get("set")?.v.length ?? 0;
    case "SISMEMBER":
      return get("set")?.v.includes(a[0]) ? 1 : 0;
    case "ZADD": {
      const z = make("z", {});
      for (let i = 0; i + 1 < a.length; i += 2) z.v[a[i + 1]] = Number(a[i]);
      return 1;
    }
    case "ZREM": {
      const z = get("z");
      let n = 0;
      for (const m of a) {
        if (!z || !(m in z.v)) continue;
        delete z.v[m];
        n++;
      }
      return n;
    }
    case "ZREVRANGE": {
      const sorted = Object.entries(get("z")?.v ?? {}).sort((x, y) => y[1] - x[1]).map(([m]) => m);
      const stop = Number(a[1]);
      return sorted.slice(Number(a[0]), stop < 0 ? sorted.length + stop + 1 : stop + 1);
    }
    case "ZCARD":
      return Object.keys(get("z")?.v ?? {}).length;
    case "LPUSH": {
      const l = make("l", []);
      l.v.unshift(...a.reverse());
      return l.v.length;
    }
    case "LRANGE": {
      const l = get("l")?.v ?? [];
      const stop = Number(a[1]);
      return l.slice(Number(a[0]), stop < 0 ? l.length + stop + 1 : stop + 1);
    }
    case "LREM": {
      const l = get("l");
      if (!l) return 0;
      const before = l.v.length;
      l.v = l.v.filter((x) => x !== a[1]);
      return before - l.v.length;
    }
    case "MGET":
      return [key, ...a].map((k) => (db.data[k]?.t === "s" ? (db.data[k] as { v: string }).v : null));
    default:
      throw new Error(`kv 흉내에 없는 명령: ${name}`);
  }
}

/** HGETALL 결과를 객체로 */
export const toObj = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (Array.isArray(v)) for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = String(v[i + 1]);
  return out;
};
