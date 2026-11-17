// 편집기(웹)와 한글 파일이 같은 모양인지 견주는 도구: 같은 값으로 ① 서버가 만든 한글(HWP) 파일을 읽어 한글의 쪽 · 높이를 계산하고
// ② 실제 크롬에서 편집기를 열어 화면 배율(50~200%)마다 그려진 쪽 · 문단 · 표 줄 높이를 재어, 다른 곳을 알려 줌.
//
// 사용: npx tsx scripts/editor-compare.ts [--zooms 50,75,100,125,150,200] [--url http://localhost:3111] [--json] [--heavy]
//   --url 이 없으면 임시 데이터 폴더와 임시 로그인으로 next dev 를 직접 띄움 (실제 데이터는 건드리지 않음). 크롬이 설치돼 있어야 함.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openHwp, tableCells, topParagraphs, TAG } from "../src/lib/hwpEdit";
import { paraInfo } from "../src/lib/hwpLines";
import { blockHeight, bodySize, readMetrics, tableHeight, tableParaGap } from "../src/lib/hwpMeasure";
import { formFields, metaFromFields } from "../src/lib/iep";
import { FORM_V2, studentFieldsV2 } from "../src/lib/iepV2";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? "") : d;
};
const ZOOMS = (opt("zooms", "50,75,100,125,150,200") ?? "").split(",").map(Number).filter(Boolean);
const PORT = 3111;
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const px = (u: number) => u / 75;

// ---------------------------------------------------------------- 임시 서버
const tmp = mkdtempSync(path.join(tmpdir(), "zelkova-compare-"));
const procs: ChildProcess[] = [];
const cleanup = () => {
  for (const p of procs) if (p.pid) spawn("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore" });
  setTimeout(() => rmSync(tmp, { recursive: true, force: true }), 1500);
};
process.on("exit", cleanup);

const ID = "t1abc2";
const LOGIN = { id: "tester", password: "tester-pass-1" };
const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(LOGIN.password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url");

function seed() {
  const f: Record<string, string> = { ...formFields("2026", "2"), form: FORM_V2, setup: "1", "term.start": "2026-08-13", "term.end": "2027-01-13", "team.principal": "이지수", "team.vice": "성한용", "team.sp1": "이혜진", "team.sp2": "한성운" };
  Object.assign(
    f,
    studentFieldsV2(f, "s1", {
      name: "박시윤",
      grade: "1",
      cls: "1",
      number: "5",
      subjects: ["국어", "수학"],
      address: "서울 노원구 초안산로2라길 26 (월계동, 월계센트럴아이파크아파트) 104동 2301호",
      phone: "010-9026-8727 (모)",
      birth: "2013. 9. 1.",
      disability: "자폐성장애",
      selectedYear: "2013. 9. 1.",
      health: "양호",
      medical: "콘서타, 리스페리돈",
      behavior: "수업에 적극적으로 참여하려는 태도를 보이며, 규칙과 약속을 지키기 위해 노력하는 모습을 보임. 주의집중 영역에 대한 적절한 지원이 이루어질 경우 통합학급 수업에도 원활하게 참여할 수 있을 것으로 보임.",
      parentNeeds: "정리정돈 지도, 처리속도가 느리므로 언어적 지시 등 중재, 전달 사항 미리 알려주기",
      career: "미정",
      parent: "방선화",
      inc: "임미애",
    }),
  );
  f.studentList = JSON.stringify(["s1"]);
  // 교과 영역: 현재 수행수준 · 장기목표 · 단기목표 · 월별 계획에 긴 글을 넣어 줄 나눔 · 쪽 나눔을 시험
  const secs = JSON.parse(f["st.s1.sectionList"] ?? "[]") as string[];
  const long = ["[9수02-04] 방정식과 그 해의 의미를 알고, 등식의 성질을 설명할 수 있다.", "[9수02-05] 일차방정식을 풀 수 있고, 이를 활용하여 문제를 해결할 수 있다.", "[9수03-01] 점, 선, 면, 각을 이해하고, 실생활 상황과 연결하여 점, 직선, 평면의 위치 관계를 설명할 수 있다."].join("\n");
  secs.forEach((id, n) => {
    f[`s.${id}.present`] = ["- 한 자리 수의 덧셈과 뺄셈을 할 수 있으나 받아올림이 있는 계산에서 어려움을 보임.", "- 일상생활 속 돈 계산에 관심이 많음."].join("\n");
    f[`s.${id}.long`] = long;
    const goals = JSON.parse(f[`s.${id}.goalList`] ?? "[]") as string[];
    goals.slice(0, 6).forEach((g, i) => {
      f[`s.${id}.g.${g}.t`] = i % 3 === 0 ? "<방정식과 그 해>" : i % 3 === 1 ? "- 등식과 방정식을 보고 서로 구별할 수 있다." : "- 주어진 수를 방정식에 대입하여 해인지 판별할 수 있으며 이를 일상생활 문제 상황에 적용할 수 있다.";
      f[`s.${id}.g.${g}.sc`] = String((i % 4) + 1);
    });
    if (n === 0) for (let j = 0; j < 4; j++) f[`s.${id}.m${j}.content`] = "방정식의 의미를 알고 등식의 성질을 활용하여 일차방정식의 해를 구하는 방법을 학습한다. 실생활 문제를 방정식으로 나타내어 해결한다.";
  });
  // --heavy: 실제 문서처럼 길게 (단기목표 27줄 · 긴 현재수준 · 장기목표 · 일상생활적응 단기목표 12줄) → 표가 쪽을 넘고, 합친 칸 묶음이 다음 쪽으로 넘어가는지 시험
  if (args.includes("--heavy")) {
    const goalText = (i: number) => (i % 4 === 0 ? `<단원 ${i / 4 + 1}>` : i % 7 === 3 ? "- 주어진 조건을 이용하여 두 도형의 관계를 판별하고, 그 까닭을 자신의 말로 설명할 수 있다." : "- 그림에서 점, 선, 면, 각을 찾아 구별할 수 있다.");
    const present = Array.from({ length: 9 }, (_, i) => (i % 3 === 2 ? "- 정수와 유리수의 사칙계산의 원리를 이해하고 계산에 활용함." : "- 수직선을 이용하여 수를 나타내고, 대소 관계를 비교함.")).join("\n");
    const longGoals = Array.from({ length: 8 }, (_, i) => (i % 3 === 1 ? "[9수03-04] 삼각형의 합동 조건을 이해하고, 이를 이용하여 두 삼각형이 합동인지 판별할 수 있다." : "[9수02-04] 방정식과 그 해의 의미를 알고, 등식의 성질을 설명할 수 있다.")).join("\n");
    secs.forEach((id, n) => {
      const life = f[`s.${id}.kind`] === "life";
      const count = life ? 12 : n === 1 ? 27 : 14;
      const ids = Array.from({ length: count }, (_, i) => `h${n}x${i}`);
      f[`s.${id}.goalList`] = JSON.stringify(ids);
      ids.forEach((g, i) => (f[`s.${id}.g.${g}.t`] = life ? (i % 5 === 4 ? "- 대인 간 거리가 주는 느낌과 감정을 알고, 상대에 따라 대인 간 거리를 조절하기" : "- 의복을 옷장에 정리 정돈하기") : goalText(i)));
      f[`s.${id}.present`] = present;
      f[`s.${id}.long`] = life ? longGoals.split("\n").slice(0, 6).join("\n") : longGoals;
    });
  }
  mkdirSync(path.join(tmp, "data"), { recursive: true });
  const meta = metaFromFields(f);
  writeFileSync(path.join(tmp, "data", "iep.json"), JSON.stringify({ index: { [ID]: { ...meta, id: ID, createdAt: Date.now(), updatedAt: Date.now() } }, docs: { [ID]: { rev: 1, values: f, revs: Object.fromEntries(Object.keys(f).map((k) => [k, 1])) } } }));
}

async function startServer(): Promise<string> {
  seed();
  const p = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", openSync(path.join(tmp, "server.log"), "w"), openSync(path.join(tmp, "server.log"), "a")],
    env: { ...process.env, STUDENTS_DATA_DIR: path.join(tmp, "data"), ADMIN_ID: LOGIN.id, ADMIN_PASSWORD_SALT: salt, ADMIN_PASSWORD_HASH: hash, AUTH_SECRET: "compare-secret", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" },
  });
  procs.push(p);
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    if (await fetch(url).then((r) => r.ok, () => false)) return url;
  }
  throw new Error(`서버가 뜨지 않았어요. ${readFileSync(path.join(tmp, "server.log"), "utf8").slice(0, 900)}`);
}

// ---------------------------------------------------------------- 한글 파일에서 계산한 모양
/** tbl: 표마다 한글의 쪽 나눔 방식 (mode 0 나누지 않음 · 1 셀 단위 · 2 나눔) · 합친 칸이 걸쳐 나눌 수 없는 줄 경계 · 표 아래 간격 */
type Model = { h: Record<number, number>; rows: Record<number, number[]>; page: Set<number>; empty: Set<number>; bodyH: number; tbl: Record<number, { mode: number; noBreak: Set<number>; gap: number }> };
function modelOf(file: Uint8Array): Model {
  const doc = openHwp(file);
  const m = readMetrics(doc.cfb, doc.compressed);
  const body = bodySize(doc.recs);
  const out: Model = { h: {}, rows: {}, page: new Set(), empty: new Set(), bodyH: px(body.height), tbl: {} };
  topParagraphs(doc.recs).forEach(([s, e], bi) => {
    if (paraInfo(doc.recs, s).pageBreak) out.page.add(bi);
    if (doc.recs.slice(s, e).some((r) => r.tag === TAG.TABLE)) {
      const t = tableHeight(doc.recs, s, e, m);
      out.rows[bi] = t.rows.map(px);
      out.h[bi] = px(t.height);
      const rec = doc.recs.slice(s, e).find((r) => r.tag === TAG.TABLE)!;
      const noBreak = new Set<number>();
      for (const c of tableCells(doc.recs, s, e)) for (let k = c.row + 1; k < c.row + c.rowSpan; k++) noBreak.add(k);
      out.tbl[bi] = { mode: rec.data.readUInt32LE(0) & 3, noBreak, gap: px(tableParaGap(doc.recs, s, e, m)) };
    } else {
      out.h[bi] = px(blockHeight(doc.recs.slice(s, e), m, body.width));
      // 글도 개체도 없는 빈 문단 (편집기는 쪽 끝에서 넘치는 빈 문단을 빼므로 같은 규칙으로 견줌)
      if (!doc.recs.slice(s, e).some((r) => r.tag === TAG.PARA_TEXT && r.data.length > 2) && !doc.recs.slice(s, e).some((r) => r.tag === TAG.CTRL_HEADER && Buffer.from(r.data.subarray(0, 4)).reverse().toString("latin1") === "gso ")) out.empty.add(bi);
    }
  });
  return out;
}

/**
 * 한글의 쪽 나누기 → 쪽마다 문단 번호. 새 쪽 표시 · 안 들어가면 다음 쪽 · 나누지 않는 표는 통째로 · 「셀 단위로 나눔」 표는 합친 칸이 걸친 줄 사이에서 나누지 않음
 * (빈 쪽에도 안 들어가면 줄 단위로) · 글자처럼 취급하는 표 아래 간격
 */
function pagesOf(n: number, h: (bi: number) => number, rows: (bi: number) => number[] | undefined, page: (bi: number) => boolean, limit: number, empty: (bi: number) => boolean = () => false, tbl: (bi: number) => Model["tbl"][number] | undefined = () => undefined) {
  const pages: string[][] = [[]];
  let used = 0;
  const cur = () => pages[pages.length - 1];
  const next = () => {
    pages.push([]);
    used = 0;
  };
  for (let bi = 0; bi < n; bi++) {
    if (page(bi) && cur().length) next();
    const rr = rows(bi);
    if (rr) {
      const t = tbl(bi);
      // 줄 말고 표가 더 차지하는 높이(바깥 여백): 편집기처럼 나뉜 조각마다 셈
      const extra = Math.max(0, h(bi) - rr.reduce((a, x) => a + x, 0));
      const total = h(bi);
      if (used + total <= limit || (t?.mode === 0 && total <= limit)) {
        if (used + total > limit) next();
        cur().push(`${bi}`);
        used += total + (t?.gap ?? 0);
        continue;
      }
      const canBreak = (k: number) => k >= rr.length || t?.mode !== 1 || !t.noBreak.has(k);
      let r = 0;
      while (r < rr.length) {
        let k = r;
        let sum = extra;
        let to = r;
        let toSum = extra;
        while (k < rr.length && used + sum + rr[k] <= limit) {
          sum += rr[k++];
          if (canBreak(k)) [to, toSum] = [k, sum];
        }
        if (to === r) {
          if (used > 0) {
            next();
            continue;
          }
          if (k > r) [to, toSum] = [k, sum];
          else [to, toSum] = [k + 1, sum + rr[k]];
        }
        cur().push(to - r === rr.length ? `${bi}` : `${bi}[${r}-${to - 1}]`);
        used += toSum;
        r = to;
        if (r < rr.length) next();
      }
      used += t?.gap ?? 0;
      continue;
    }
    if (empty(bi) && (used + h(bi) > limit || (used === 0 && !page(bi)))) continue;
    if (used + h(bi) > limit && used > 0) next();
    cur().push(`${bi}`);
    used += h(bi);
  }
  return pages.filter((p) => p.length);
}

// ---------------------------------------------------------------- 크롬 (DevTools 프로토콜을 직접 씀)
class Cdp {
  private id = 0;
  private waits = new Map<number, (v: { result?: unknown; error?: { message: string } }) => void>();
  constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.waits.has(msg.id)) {
        this.waits.get(msg.id)!(msg);
        this.waits.delete(msg.id);
      }
    };
  }
  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result as T)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = unknown>(js: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

async function openChrome(): Promise<Cdp> {
  if (!CHROME) throw new Error("크롬(또는 엣지)을 찾지 못했어요.");
  const port = 9333;
  procs.push(
    spawn(CHROME, [`--remote-debugging-port=${port}`, "--remote-allow-origins=*", `--user-data-dir=${path.join(tmp, "chrome")}`, "--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" }),
  );
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const list = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => null)) as { type: string; webSocketDebuggerUrl: string }[] | null;
    const tab = list?.find((t) => t.type === "page");
    if (tab) {
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));
      return new Cdp(ws);
    }
  }
  throw new Error("크롬에 연결하지 못했어요.");
}

const EXTRACT = `(() => [...document.querySelectorAll('[aria-label$="쪽"]')].map((pg) => ({
  blocks: [...pg.querySelectorAll('[data-bi]')].map((el) => ({ bi: +el.dataset.bi, table: !!el.dataset.table, h: el.getBoundingClientRect().height,
    rows: el.dataset.table ? [...el.querySelectorAll('tr[data-r]')].map((tr) => ({ r: +tr.dataset.r, h: tr.getBoundingClientRect().height })) : [] })),
})))()`;
const CLICK_TEXT = (t: string) =>
  `(() => { const els = [...document.querySelectorAll('button,a,[role=button]')].filter((e) => (e.textContent||'').includes(${JSON.stringify(t)}) && e.children.length < 8 && !e.closest('[aria-hidden=true],[inert]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.invisible,[style*="visibility: hidden"]')); els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length); const e = els[0]; if (!e) return false; e.click(); return true; })()`;

type Dom = { blocks: { bi: number; table: boolean; h: number; rows: { r: number; h: number }[] }[] }[];

async function measure(cdp: Cdp, base: string, zoom: number): Promise<Dom> {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.round(1500 / zoom), height: Math.round(1000 / zoom), deviceScaleFactor: zoom, mobile: false });
  await cdp.send("Page.navigate", { url: base });
  await sleep(2500);
  await cdp.eval(`fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(LOGIN)})}).then(r=>r.status)`);
  await cdp.eval(`localStorage.setItem('zelkova:iep:me','검사')`);
  await cdp.send("Page.navigate", { url: base });
  // 화면이 알려 주는 대로 한 걸음씩: 행정 업무 탭 → 개별화교육계획 카드 → 계획 고르기 → 이름 확인 → 편집기
  let last = "";
  for (let i = 0; i < 90; i++) {
    await sleep(700);
    const cur = JSON.stringify(await cdp.eval<Dom>(EXTRACT));
    if (process.env.DEBUG && i % 5 === 0) console.log(i, "쪽 수", cur === "[]" ? 0 : (JSON.parse(cur) as Dom).length, cur.length);
    if (cur !== "[]") {
      if (cur === last) return JSON.parse(cur);
      last = cur;
      continue;
    }
    const step = await cdp.eval<string>(`(() => {
      const submit = document.querySelector('form button[type=submit]');
      if (submit && !submit.disabled) { submit.click(); return 'name'; }
      return 'none';
    })()`);
    if (step === "name") continue;
    if (await cdp.eval<boolean>(CLICK_TEXT("2026학년도"))) continue;
    if (await cdp.eval<boolean>(CLICK_TEXT("개별화교육계획 작성하기"))) continue;
    const tab = await cdp.eval<string>(`(() => { const t = document.querySelector('#tab-admin'); t?.click(); return (t ? 'tab ' : 'no-tab ') + (document.querySelector('[role=tab][aria-selected=true]')?.textContent ?? '') + ' ' + location.href; })()`);
    if (process.env.DEBUG) console.log(i, tab);
  }
  const seen = await cdp.eval<string>(`document.body.innerText.slice(0, 500)`);
  throw new Error(`편집기가 그려지지 않았어요 (배율 ${zoom}%). 지금 화면: ${seen}`);
}

// ---------------------------------------------------------------- 편집 동작 시험 (선택한 글에만 굵게 · 되돌리기 · 이어 쓰기)
async function key(cdp: Cdp, k: string, code: string, vk: number, modifiers = 0) {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
}
async function richTest(cdp: Cdp) {
  const F = "[data-field$='.behavior']";
  const spans = () => cdp.eval<unknown>(`(() => { const r = document.querySelector("[data-rich]${F}"); return r ? [...r.querySelectorAll("span")].map((s) => [s.textContent, s.dataset.b ?? "-", s.dataset.z ?? "-"]) : null; })()`);
  const mode = () => cdp.eval<string>(`(() => document.querySelector("[data-rich]${F}") ? "rich" : document.querySelector("textarea${F}") ? "plain" : "none")()`);
  const ok = (name: string, cond: boolean, got: unknown) => console.log(`  ${cond ? "✔" : "✘"} ${name}${cond ? "" : " → " + JSON.stringify(got)}`);
  console.log("편집 동작 시험:");
  await cdp.eval(`(() => { const t = document.querySelector("textarea${F}"); t.scrollIntoView({ block: "center" }); t.focus(); t.setSelectionRange(3, 6); })()`);
  await sleep(300);
  await key(cdp, "b", "KeyB", 66, 2); // Ctrl+B
  await sleep(700);
  const a = await spans();
  ok("글 일부를 고르고 Ctrl+B → 그 글만 바뀜(글 칸으로 바뀜)", (await mode()) === "rich" && JSON.stringify(a).match(/"[01]"/) !== null, a);
  const only = ((a as string[][] | null) ?? []).filter((x) => x[1] !== "-");
  ok("모양이 바뀐 글이 고른 3글자뿐", only.length === 1 && only[0][0].length === 3, only);
  // 이어서 입력
  await cdp.eval(`(() => { const r = document.querySelector("[data-rich]${F}"); r.focus(); const sp = r.querySelector("span[data-b]"); const t = sp.firstChild; const g = getSelection(); g.collapse(t, t.length); })()`);
  await cdp.send("Input.insertText", { text: "XY" });
  await sleep(700);
  const b = await spans();
  ok("바뀐 글 끝에 이어 쓰면 같은 모양으로 이어짐", JSON.stringify(b).includes("XY") && ((b as string[][] | null) ?? []).some((x) => x[0].includes("XY") && x[1] !== "-"), b);
  // Ctrl+Z
  await key(cdp, "z", "KeyZ", 90, 2);
  await sleep(700);
  const c = await spans();
  ok("Ctrl+Z 로 입력 되돌림", !JSON.stringify(c ?? "").includes("XY"), c);
  await key(cdp, "z", "KeyZ", 90, 2);
  await sleep(700);
  ok("Ctrl+Z 한 번 더 → 굵게 해제(다시 글 상자)", (await mode()) === "plain", await mode());
  await key(cdp, "y", "KeyY", 89, 2);
  await sleep(700);
  ok("Ctrl+Y 로 굵게 다시 적용", (await mode()) === "rich", await mode());
  // 앞 글 고정: 현재학습 수행수준 "- ", 장기목표 "["
  for (const [sel, lock] of [[".present", "- "], [".long", "["]] as const) {
    const val = () => cdp.eval<string>(`document.querySelector("textarea[data-field$='${sel}']")?.value ?? "(없음)"`);
    const first = await val();
    ok(`${sel} 기본 글이 "${lock}"로 시작`, first.startsWith(lock), first);
    await cdp.eval(`(() => { const t = document.querySelector("textarea[data-field$='${sel}']"); t.scrollIntoView({ block: "center" }); t.focus(); t.setSelectionRange(0, t.value.length); })()`);
    await key(cdp, "Backspace", "Backspace", 8);
    await sleep(500);
    const after = await val();
    ok(`${sel} 전부 지워도 "${lock}"가 남음`, after.startsWith(lock), after);
  }
}

// ---------------------------------------------------------------- 실행
async function main() {
  const base = opt("url") ?? (await startServer());
  const login = await fetch(`${base}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(LOGIN) });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  if (process.env.DEBUG) console.log("목록:", (await fetch(`${base}/api/iep`, { headers: { cookie } }).then((r) => r.text())).slice(0, 300));
  const hwp = await fetch(`${base}/api/iep/hwp?id=${ID}`, { headers: { cookie } });
  if (!hwp.ok) throw new Error(`한글 파일을 받지 못했어요: ${hwp.status} ${await hwp.text()}`);
  const model = modelOf(new Uint8Array(await hwp.arrayBuffer()));
  const n = Object.keys(model.h).length;
  const wantPages = pagesOf(n, (b) => model.h[b], (b) => model.rows[b], (b) => model.page.has(b), model.bodyH + 0.5, (b) => model.empty.has(b), (b) => model.tbl[b]);
  console.log(`한글 파일(계산): ${wantPages.length}쪽 · 본문 높이 ${model.bodyH.toFixed(1)}px`);
  wantPages.forEach((p, i) => console.log(`  ${i + 1}쪽: ${p.join(" ")}`));

  const cdp = await openChrome();
  await cdp.send("Page.enable");
  let bad = 0;
  const report: unknown[] = [];
  for (const zoom of ZOOMS) {
    const dom = await measure(cdp, base, zoom);
    const gotPages = dom.map((p) => {
      const seen = new Map<number, number[]>();
      for (const b of p.blocks) if (b.table) seen.set(b.bi, [...(seen.get(b.bi) ?? []), ...b.rows.map((r) => r.r)]);
      return [...new Set(p.blocks.map((b) => b.bi))].map((bi) => {
        const rr = seen.get(bi);
        return rr && rr.length !== (model.rows[bi]?.length ?? rr.length) ? `${bi}[${rr[0]}-${rr[rr.length - 1]}]` : `${bi}`;
      });
    });
    let worst = { bi: -1, d: 0 };
    const diffs: string[] = [];
    for (const p of dom)
      for (const b of p.blocks) {
        const d = b.table ? b.rows.reduce((s, r) => s + r.h, 0) - b.rows.reduce((s, r) => s + (model.rows[b.bi]?.[r.r] ?? 0), 0) : b.h - (model.h[b.bi] ?? 0);
        if (Math.abs(d) > Math.abs(worst.d)) worst = { bi: b.bi, d };
        const w = b.table
          ? b.rows.map((r) => ({ k: r.r, d: r.h - (model.rows[b.bi]?.[r.r] ?? 0) })).filter((x) => Math.abs(x.d) > 1.5).map((x) => `${x.k}:${x.d.toFixed(1)}`)
          : Math.abs(d) > 1.5
            ? [d.toFixed(1)]
            : [];
        if (diffs.length < 14 && w.length) diffs.push(`${b.bi}(${w.join(",")})`);
      }
    const same = JSON.stringify(gotPages) === JSON.stringify(wantPages);
    if (!same) bad++;
    console.log(`배율 ${String(zoom).padStart(3)}%: ${gotPages.length}쪽 ${same ? "✔ 쪽 나뉨 같음" : "✘ 쪽 나뉨 다름"} · 가장 큰 높이 차이 ${worst.d.toFixed(1)}px (문단 ${worst.bi})`);
    if (!same) gotPages.forEach((p, i) => console.log(`    ${i + 1}쪽: ${p.join(" ")}`));
    if (diffs.length) console.log(`    1.5px 넘게 다른 곳(화면−한글): ${diffs.join(" ")}`);
    report.push({ zoom, pages: gotPages, worst });
  }
  if (process.env.PROBE) {
    const dom = await cdp.eval<unknown>(`(() => [...document.querySelectorAll('[data-bi="${process.env.PROBE}"] td')].map((td) => ({ r: td.parentElement.dataset.r, w: Math.round(td.getBoundingClientRect().width * 10) / 10, h: Math.round(td.getBoundingClientRect().height * 10) / 10, items: [...td.querySelectorAll('textarea,[data-rich],[data-st]')].map((el) => { const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || 1; const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom); return [el.tagName[0] + (el.dataset.field ?? ''), Math.round(el.getBoundingClientRect().width * 10) / 10, Math.round(inner / lh * 10) / 10, (el.value ?? el.textContent ?? '').slice(0, 14)]; }) })))()`);
    console.log("PROBE", JSON.stringify(dom));
  }
  if (args.includes("--rich")) await richTest(cdp);
  if (args.includes("--json")) console.log(JSON.stringify(report));
  console.log(bad ? `\n쪽 나뉨이 다른 배율 ${bad}개` : "\n모든 배율에서 한글 파일과 쪽 나뉨이 같음");
  process.exitCode = bad ? 1 : 0;
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 2;
  })
  .finally(() => {
    cleanup();
    setTimeout(() => process.exit(), 2000);
  });
