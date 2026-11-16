// 편집기(웹)와 한글 파일이 같은 모양인지 견주는 도구: 같은 값으로 ① 서버가 만든 한글(HWP) 파일을 읽어 한글의 쪽 · 높이를 계산하고
// ② 실제 크롬에서 편집기를 열어 화면 배율(50~200%)마다 그려진 쪽 · 문단 · 표 줄 높이를 재어, 다른 곳을 알려 줌.
//
// 사용: npx tsx scripts/editor-compare.ts [--zooms 50,75,100,125,150,200] [--url http://localhost:3111] [--json]
//   --url 이 없으면 임시 데이터 폴더와 임시 로그인으로 next dev 를 직접 띄움 (실제 데이터는 건드리지 않음). 크롬이 설치돼 있어야 함.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openHwp, topParagraphs, TAG } from "../src/lib/hwpEdit";
import { paraInfo } from "../src/lib/hwpLines";
import { bodySize, paraHeight, readMetrics, tableHeight } from "../src/lib/hwpMeasure";
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
  mkdirSync(path.join(tmp, "data"), { recursive: true });
  const meta = metaFromFields(f);
  writeFileSync(path.join(tmp, "data", "iep.json"), JSON.stringify({ index: { [ID]: { ...meta, id: ID, createdAt: Date.now(), updatedAt: Date.now() } }, docs: { [ID]: { rev: 1, values: f, revs: Object.fromEntries(Object.keys(f).map((k) => [k, 1])) } } }));
}

async function startServer(): Promise<string> {
  seed();
  const p = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: "ignore",
    env: { ...process.env, STUDENTS_DATA_DIR: path.join(tmp, "data"), ADMIN_ID: LOGIN.id, ADMIN_PASSWORD_SALT: salt, ADMIN_PASSWORD_HASH: hash, AUTH_SECRET: "compare-secret", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" },
  });
  procs.push(p);
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    if (await fetch(url).then((r) => r.ok, () => false)) return url;
  }
  throw new Error("서버가 뜨지 않았어요.");
}

// ---------------------------------------------------------------- 한글 파일에서 계산한 모양
type Model = { h: Record<number, number>; rows: Record<number, number[]>; page: Set<number>; bodyH: number };
function modelOf(file: Uint8Array): Model {
  const doc = openHwp(file);
  const m = readMetrics(doc.cfb, doc.compressed);
  const body = bodySize(doc.recs);
  const out: Model = { h: {}, rows: {}, page: new Set(), bodyH: px(body.height) };
  topParagraphs(doc.recs).forEach(([s, e], bi) => {
    if (paraInfo(doc.recs, s).pageBreak) out.page.add(bi);
    if (doc.recs.slice(s, e).some((r) => r.tag === TAG.TABLE)) {
      const t = tableHeight(doc.recs, s, e, m);
      out.rows[bi] = t.rows.map(px);
      out.h[bi] = px(t.height);
    } else out.h[bi] = px(paraHeight(doc.recs, s, body.width, m));
  });
  return out;
}

/** 쪽 나누기 (편집기와 같은 규칙: 새 쪽 표시 · 안 들어가면 다음 쪽 · 표는 줄 단위로) → 쪽마다 문단 번호 */
function pagesOf(n: number, h: (bi: number) => number, rows: (bi: number) => number[] | undefined, page: (bi: number) => boolean, limit: number) {
  const pages: string[][] = [[]];
  let used = 0;
  const cur = () => pages[pages.length - 1];
  for (let bi = 0; bi < n; bi++) {
    if (page(bi) && cur().length) {
      pages.push([]);
      used = 0;
    }
    const rr = rows(bi);
    if (rr) {
      let r = 0;
      while (r < rr.length) {
        let k = r;
        let sum = 0;
        while (k < rr.length && used + sum + rr[k] <= limit) sum += rr[k++];
        if (k === r) {
          if (used > 0) {
            pages.push([]);
            used = 0;
            continue;
          }
          sum += rr[k++];
        }
        cur().push(k - r === rr.length ? `${bi}` : `${bi}[${r}-${k - 1}]`);
        used += sum;
        r = k;
        if (r < rr.length) {
          pages.push([]);
          used = 0;
        }
      }
      continue;
    }
    if (used + h(bi) > limit && used > 0) {
      pages.push([]);
      used = 0;
    }
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
  const wantPages = pagesOf(n, (b) => model.h[b], (b) => model.rows[b], (b) => model.page.has(b), model.bodyH + 0.5);
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
