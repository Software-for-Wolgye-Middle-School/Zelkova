"use client";

import { useEffect, useMemo, useState } from "react";
import {
  a4Layout,
  BOOK_H,
  BOOK_MM,
  BOOK_MM_MAX,
  BOOK_MM_MIN,
  BOOK_W,
  bankbookPages,
  bankbookText,
  largestWidthFor,
  PAPER_COLORS,
  type Bankbook,
  type PaperColor,
} from "@/lib/bankbookSvg";
import { embeddedFontCss, loadImageDataUrl, safeFileName, svgToPng, withFont } from "@/lib/svgExport";
import { DownloadIcon, Spinner } from "./icons";
import type { Student } from "@/lib/timetable";

/** public/background 의 캐릭터 그림. 앞 그림은 표지, 뒤 그림(캐릭터 없는 같은 배경)은 뒤표지 */
const PICTURES = [
  { key: "hello_kitty", label: "헬로키티", file: "hello_kitty/hellokitty" },
  { key: "pingu", label: "핑구", file: "pingu/pingu" },
  { key: "jerry", label: "제리", file: "jerry/jerry" },
  { key: "kurumi", label: "쿠루미", file: "kurumi/kurumi" },
  { key: "smurf", label: "스머프", file: "smurf/smurf" },
  { key: "thomas", label: "토마스", file: "thomas/thomas" },
  { key: "conan", label: "코난", file: "conan/conan" },
  { key: "cinamon", label: "시나모롤", file: "cinamon/cinamon" },
] as const;
type PictureKey = (typeof PICTURES)[number]["key"];

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 쪽 크기 바로 고르기: A4 한 장에 n쪽이 들어가는 가장 큰 크기 */
const SIZE_PRESETS = [1, 2, 4, 8].map((n) => ({ n, w: largestWidthFor(n) }));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BankbookApp({ students }: { students: Student[] }) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("느티나무 은행");
  const [branch, setBranch] = useState("월계중학교");
  const [issued, setIssued] = useState(today);
  const [account, setAccount] = useState(() => `${today()}-01`);
  const [kind, setKind] = useState<Bankbook["kind"]>("신규");
  const [paper, setPaper] = useState<PaperColor>("노랑");
  const [ledgers, setLedgers] = useState(5);
  const [pageW, setPageW] = useState<number>(BOOK_MM.w);
  const [picture, setPicture] = useState<PictureKey>("hello_kitty");
  const [art, setArt] = useState<{ key: PictureKey; front: string; back: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const savedNames = useMemo(() => [...new Set(students.map((s) => s.name))], [students]);

  useEffect(() => {
    const pic = PICTURES.find((p) => p.key === picture)!;
    let cancelled = false;
    // 쪽을 크게 인쇄해도 흐리지 않도록 넉넉히 둠
    const load = (side: string) => loadImageDataUrl(`/background/${pic.file}_${side}.png`, BOOK_W * 3);
    Promise.all([load("front"), load("back")])
      .then(([front, back]) => !cancelled && setArt({ key: pic.key, front, back }))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [picture]);

  const pictureArt = art?.key === picture ? art : null;
  const cover = pictureArt?.front;
  const back = pictureArt?.back;
  const layout = useMemo(() => a4Layout(pageW), [pageW]);
  // 표지 · 속지 · 거래 내역 · 뒤표지
  const sheets = Math.ceil((ledgers + 3) / layout.perSheet);

  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 10);
  const book = useMemo<Bankbook | null>(
    () =>
      cover && back
        ? { name: trimmed, bank: bank.trim(), branch: branch.trim(), account: account.trim(), issued, kind, paper, cover, back }
        : null,
    [trimmed, bank, branch, account, issued, kind, paper, cover, back],
  );
  const pages = useMemo(() => (book ? bankbookPages(book, ledgers) : []), [book, ledgers]);
  const baseName = `${safeFileName(trimmed)} 칭찬통장`;

  /** 고른 크기 그대로 모든 쪽을 A4 한 장에 들어가는 만큼 놓고 자르는 점선을 그려 PDF 로 내려받음 */
  const savePdf = async () => {
    if (!book) return;
    setBusy(true);
    setExportError(null);
    try {
      const [{ jsPDF }, css] = await Promise.all([import("jspdf"), embeddedFontCss(bankbookText(book))]);
      const { orientation, page, cols, perSheet, left, top } = layout;
      const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
      const { w, h } = page;
      // 크게 인쇄할수록 그림을 더 촘촘하게 만듦
      const scale = Math.max(2, (2 * w) / BOOK_MM.w);
      doc.setLineDashPattern([1, 1], 0);
      doc.setLineWidth(0.2);
      doc.setDrawColor(187);
      // 거래 내역 쪽은 모두 같으므로 그림을 한 번만 만들어 다시 씀
      const images = new Map<string, { data: Uint8Array; alias: string }>();
      for (const [i, p] of pages.entries()) {
        const slot = i % perSheet;
        if (i > 0 && slot === 0) doc.addPage();
        let img = images.get(p.svg);
        if (!img) {
          const blob = await svgToPng(withFont(p.svg, css), BOOK_W, BOOK_H, scale, "image/jpeg");
          img = { data: new Uint8Array(await blob.arrayBuffer()), alias: `page-${images.size}` };
          images.set(p.svg, img);
        }
        const x = left + (slot % cols) * w;
        const y = top + Math.floor(slot / cols) * h;
        doc.addImage(img.data, "JPEG", x, y, w, h, img.alias);
        doc.rect(x, y, w, h);
      }
      doc.save(`${baseName}.pdf`);
    } catch (e) {
      console.error(e);
      setExportError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">칭찬통장 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          표지 · 속지 · 거래 내역 · 뒤표지를 템플릿 모양 그대로 만들어요. 좋아하는 캐릭터 그림을 골라 보세요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <span className="block text-sm font-semibold text-slate-800">그림</span>
            <p className="mt-0.5 text-xs text-slate-500">앞 그림은 표지, 뒤 그림은 맨 뒤 뒤표지가 돼요.</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {PICTURES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPicture(p.key)}
                  aria-pressed={picture === p.key}
                  className={`rounded-lg px-2 py-2 text-sm font-semibold ring-1 ring-inset transition ${
                    picture === p.key ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {!pictureArt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Spinner className="h-3.5 w-3.5" /> 그림을 불러오고 있어요
              </p>
            )}
          </div>

          <details open className="group rounded-xl border border-slate-200">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
              속지 내용
              <span className="text-slate-400 transition group-open:rotate-180" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-4 py-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="bb-name">
                  이름
                </label>
                <input
                  id="bb-name"
                  value={name}
                  maxLength={10}
                  autoComplete="off"
                  placeholder="예: 하초현"
                  onChange={(e) => setName(e.target.value)}
                  className={field}
                />
                {savedNames.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {savedNames.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setName(n)}
                        aria-pressed={trimmed === n}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          trimmed === n ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field label="은행 이름">
                <input value={bank} maxLength={12} onChange={(e) => setBank(e.target.value)} className={field} />
              </Field>
              <Field label="지점">
                <input value={branch} maxLength={20} placeholder="예: 서울 ○○중학교" onChange={(e) => setBranch(e.target.value)} className={field} />
              </Field>
              <Field label="계좌번호">
                <input value={account} maxLength={24} onChange={(e) => setAccount(e.target.value)} className={field} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="통장 발행일">
                  <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className={field} />
                </Field>
                <Field label="구분">
                  <select value={kind} onChange={(e) => setKind(e.target.value as Bankbook["kind"])} className={field}>
                    <option value="신규">신규</option>
                    <option value="재발급">재발급</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="속지 색">
                  <select value={paper} onChange={(e) => setPaper(e.target.value as PaperColor)} className={field}>
                    {Object.keys(PAPER_COLORS).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="거래 내역">
                  <select value={ledgers} onChange={(e) => setLedgers(Number(e.target.value))} className={field}>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}쪽
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </details>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="bb-size" className="text-sm font-semibold text-slate-800">
                쪽 크기
              </label>
              <span className="text-xs font-semibold text-indigo-700">
                {layout.page.w} × {layout.page.h}mm
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">A4 종이에 놓을 크기를 먼저 정하면 모든 쪽이 같은 크기로 만들어져요.</p>
            <input
              id="bb-size"
              type="range"
              min={BOOK_MM_MIN}
              max={BOOK_MM_MAX}
              step={1}
              value={pageW}
              onChange={(e) => setPageW(Number(e.target.value))}
              className="mt-3 w-full accent-indigo-600"
            />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {SIZE_PRESETS.map((p) => (
                <button
                  key={p.n}
                  type="button"
                  onClick={() => setPageW(p.w)}
                  aria-pressed={pageW === p.w}
                  className={`rounded-lg px-1 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                    pageW === p.w ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {p.n}쪽
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              표지 · 속지 · 거래 내역 {ledgers}쪽 · 뒤표지를 A4 {layout.orientation === "landscape" ? "가로" : "세로"} 한 장에{" "}
              {layout.perSheet}쪽씩 놓아 모두 {sheets}장이에요.
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={savePdf}
              disabled={!trimmed || busy || !book}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              PDF로 저장하기
            </button>
            {!trimmed && <p className="text-center text-xs text-slate-400">이름을 입력하면 저장할 수 있어요</p>}
            {exportError && (
              <p role="alert" className="text-center text-xs font-medium text-red-600">
                {exportError}
              </p>
            )}
          </div>
        </div>

        <section aria-label="칭찬통장 미리보기" className="min-w-0 space-y-4">
          {/* A4 첫 장에 고른 크기로 놓인 모습 */}
          <figure className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
            <figcaption className="mb-2 text-xs font-semibold text-slate-500">
              A4 {layout.orientation === "landscape" ? "가로" : "세로"} 첫 장 · 한 쪽 {layout.page.w} × {layout.page.h}mm
            </figcaption>
            <div
              className="relative mx-auto bg-white shadow-md"
              style={{
                aspectRatio: `${layout.paper.w} / ${layout.paper.h}`,
                maxWidth: layout.orientation === "landscape" ? 640 : 452,
              }}
            >
              {pages.slice(0, layout.perSheet).map((p, slot) => (
                <div
                  key={p.key}
                  className="absolute overflow-hidden outline-dashed outline-1 outline-slate-300 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  style={{
                    left: `${((layout.left + (slot % layout.cols) * layout.page.w) / layout.paper.w) * 100}%`,
                    top: `${((layout.top + Math.floor(slot / layout.cols) * layout.page.h) / layout.paper.h) * 100}%`,
                    width: `${(layout.page.w / layout.paper.w) * 100}%`,
                    height: `${(layout.page.h / layout.paper.h) * 100}%`,
                  }}
                  dangerouslySetInnerHTML={{ __html: p.svg }}
                />
              ))}
            </div>
          </figure>

          {/* 표지 · 속지 · 거래 내역 첫 쪽 · 뒤표지만 미리 보여 줌 (거래 내역은 모든 쪽이 같음) */}
          {pages.filter((p) => !p.key.startsWith("ledger") || p.key === "ledger-0").map((p) => (
            <figure key={p.key} className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
              <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                {p.key.startsWith("ledger") ? `거래 내역 (${ledgers}쪽)` : p.label}
              </figcaption>
              <div
                className="mx-auto max-w-[640px] overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                // bankbookPages 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                dangerouslySetInnerHTML={{ __html: p.svg }}
              />
            </figure>
          ))}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
