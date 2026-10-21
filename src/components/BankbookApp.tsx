"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  BOOK_H,
  BOOK_MM,
  BOOK_W,
  bankbookPages,
  bankbookText,
  ledgersForSheets,
  PAPER_COLORS,
  type Bankbook,
  type PaperColor,
} from "@/lib/bankbookSvg";
import { downloadBlob, embeddedFontCss, printSheets, safeFileName, svgToPng, withFont } from "@/lib/svgExport";
import AiArtPanel, { type ArtExample } from "./AiArtPanel";
import { DownloadIcon, Spinner } from "./icons";
import { loadRows } from "./students";

const COVER_EXAMPLES: ArtExample[] = [
  {
    label: "템플릿 (보름달 · 감나무)",
    prompt: "커다란 노란 보름달이 뜬 남색 가을 밤하늘과 주황색 감이 달린 감나무 가지",
  },
  { label: "봄 벚꽃", prompt: "분홍 벚꽃이 흩날리는 봄 언덕과 작은 새들" },
  { label: "바닷속", prompt: "알록달록한 물고기와 산호가 있는 맑은 바닷속" },
  { label: "우주", prompt: "반짝이는 별과 행성 사이를 나는 귀여운 로켓" },
  { label: "겨울 마을", prompt: "눈이 소복이 내린 겨울 마을과 웃는 눈사람" },
];
const COVER_LAYOUT = "wide landscape scene, simple open background in the center";

/** public/pictures 의 캐릭터 그림. 앞 그림은 표지, 뒤 그림(캐릭터 없는 같은 배경)은 속지 바탕 */
const PICTURES = [
  { key: "pingu", label: "핑구", file: "pingu/pingu" },
  { key: "hello_kitty", label: "헬로키티", file: "hello_kitty/hellokitty" },
  { key: "jerry", label: "제리", file: "jerry/jerry" },
  { key: "kurumi", label: "쿠루미", file: "kurumi/kurumi" },
  { key: "smurf", label: "스머프", file: "smurf/smurf" },
  { key: "thomas", label: "토마스", file: "thomas/thomas" },
] as const;
type PictureKey = (typeof PICTURES)[number]["key"] | "ai";

/** 그림을 쪽 크기에 맞게 줄여 data: 주소로 만듦 (그림 파일 저장 · 인쇄 창에서도 보이도록) */
const pictureCache = new Map<string, Promise<string>>();
function loadPicture(src: string) {
  let p = pictureCache.get(src);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const scale = Math.min(1, (BOOK_W * 2) / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.88);
    })();
    p.catch(() => pictureCache.delete(src));
    pictureCache.set(src, p);
  }
  return p;
}

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BankbookApp() {
  const [name, setName] = useState("");
  const [bank, setBank] = useState("느티나무 은행");
  const [branch, setBranch] = useState("");
  const [issued, setIssued] = useState(today);
  const [account, setAccount] = useState(() => `${today()}-01`);
  const [kind, setKind] = useState<Bankbook["kind"]>("신규");
  const [paper, setPaper] = useState<PaperColor>("노랑");
  const [sheets, setSheets] = useState(2);
  const [picture, setPicture] = useState<PictureKey>("pingu");
  const [art, setArt] = useState<{ key: PictureKey; front: string; back: string } | null>(null);
  const [aiCover, setAiCover] = useState<string | undefined>();
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<"png" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const rows = loadRows() ?? [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSavedNames([...new Set(rows.map((r) => r.name.trim()).filter(Boolean))]);
  }, []);

  useEffect(() => {
    const pic = PICTURES.find((p) => p.key === picture);
    if (!pic) return;
    let cancelled = false;
    Promise.all([loadPicture(`/pictures/${pic.file}_front.png`), loadPicture(`/pictures/${pic.file}_back.png`)])
      .then(([front, back]) => !cancelled && setArt({ key: pic.key, front, back }))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [picture]);

  const pictureArt = picture !== "ai" && art?.key === picture ? art : null;
  const cover = picture === "ai" ? aiCover : pictureArt?.front;
  const back = pictureArt?.back;
  const ledgers = ledgersForSheets(sheets, !!back);

  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 10);
  const book = useMemo<Bankbook>(
    () => ({ name: trimmed, bank: bank.trim(), branch: branch.trim(), account: account.trim(), issued, kind, paper, cover, back }),
    [trimmed, bank, branch, account, issued, kind, paper, cover, back],
  );
  const pages = useMemo(() => bankbookPages(book, ledgers), [book, ledgers]);
  const baseName = `${safeFileName(trimmed)} 칭찬통장`;

  const withFonts = async () => {
    const css = await embeddedFontCss(bankbookText(book));
    return pages.map((p) => ({ ...p, svg: withFont(p.svg, css) }));
  };

  const downloadZip = async () => {
    setBusy("png");
    setExportError(null);
    try {
      const zip = new JSZip();
      for (const [i, p] of (await withFonts()).entries()) {
        zip.file(`${String(i + 1).padStart(2, "0")} ${p.label}.png`, await svgToPng(p.svg, BOOK_W, BOOK_H, 2));
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${baseName}.zip`);
    } catch (e) {
      console.error(e);
      setExportError("그림 파일로 저장하지 못했어요. 인쇄 버튼으로 PDF 저장을 이용해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    const win = window.open("", "_blank"); // 팝업 차단을 피하려고 클릭하자마자 창을 엶
    if (!win) return setExportError("팝업이 차단되어 인쇄 창을 열 수 없어요.");
    setBusy("print");
    setExportError(null);
    try {
      printSheets(win, {
        title: baseName,
        page: { w: 297, h: 210, css: "A4 landscape" },
        items: (await withFonts()).map((p) => p.svg),
        itemMm: BOOK_MM,
        cols: 2,
        rows: 2,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">칭찬통장 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          표지 · 속지 · 거래 내역을 템플릿 모양 그대로 만들어요. 캐릭터 그림을 고르거나 AI에게 표지 그림을 그려 달라고 할 수 있어요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="bb-name">
              이름
            </label>
            <input
              id="bb-name"
              value={name}
              maxLength={10}
              autoComplete="off"
              placeholder="예: 하초현"
              onChange={(e) => setName(e.target.value)}
              className={`mt-2 ${field}`}
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

          <div>
            <span className="block text-sm font-semibold text-slate-800">그림</span>
            <p className="mt-0.5 text-xs text-slate-500">앞 그림은 표지, 뒤 그림은 맨 뒤 뒤표지가 돼요.</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[...PICTURES, { key: "ai" as const, label: "AI 그림" }].map((p) => (
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
            {picture !== "ai" && !pictureArt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Spinner className="h-3.5 w-3.5" /> 그림을 불러오고 있어요
              </p>
            )}
          </div>

          {picture === "ai" && (
            <AiArtPanel
              id="bb-cover"
              examples={COVER_EXAMPLES}
              layout={COVER_LAYOUT}
              width={1184}
              height={840}
              hasArt={!!aiCover}
              onArt={setAiCover}
            />
          )}

          <details className="group rounded-xl border border-slate-200">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
              속지 내용
              <span className="text-slate-400 transition group-open:rotate-180" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-4 py-4">
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
                <Field label="A4 장수">
                  <select value={sheets} onChange={(e) => setSheets(Number(e.target.value))} className={field}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}장
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                첫 장은 표지 · 속지 · 거래 내역 2쪽, 둘째 장부터는 거래 내역 4쪽씩 들어가요.
                {back && " 마지막 쪽은 뒤표지예요."} (거래 내역 모두 {ledgers}쪽)
              </p>
            </div>
          </details>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={print}
              disabled={!trimmed || busy !== null || (picture !== "ai" && !pictureArt)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy === "print" && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장 (A4 한 장에 4쪽)
            </button>
            <button
              type="button"
              onClick={downloadZip}
              disabled={!trimmed || busy !== null || (picture !== "ai" && !pictureArt)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {busy === "png" ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              쪽마다 그림 파일로 저장 (ZIP)
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
          {/* 표지 · 속지 · 거래 내역 첫 쪽 · 뒤표지만 미리 보여 줌 (거래 내역은 모든 쪽이 같음) */}
          {pages.filter((p) => !p.key.startsWith("ledger") || p.key === "ledger-0").map((p) => (
            <figure key={p.key} className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
              <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                {p.key.startsWith("ledger") ? `거래 내역 (${ledgers}쪽 · A4 ${sheets}장)` : p.label}
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
