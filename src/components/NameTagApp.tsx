"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { nameTagSvg, nameTagText, TAG_COLORS, TAG_H, TAG_MM, TAG_W, type NameTag, type TagColor } from "@/lib/nameTagSvg";
import { downloadBlob, embeddedFontCss, printSheets, safeFileName, svgToPng, withFont } from "@/lib/svgExport";
import AiArtPanel, { type ArtExample } from "./AiArtPanel";
import { DownloadIcon, Spinner } from "./icons";
import { loadRows } from "./students";

const TAG_EXAMPLES: ArtExample[] = [
  { label: "느티나무 언덕", prompt: "커다란 느티나무와 작은 새들이 있는 맑은 봄 언덕" },
  { label: "무지개", prompt: "파란 하늘의 무지개와 몽글몽글한 구름" },
  { label: "꽃밭", prompt: "알록달록한 꽃밭과 나비들" },
  { label: "공룡", prompt: "초록 들판에서 노는 귀여운 아기 공룡들" },
  { label: "우주", prompt: "반짝이는 별과 행성, 작은 로켓이 있는 우주" },
];
const TAG_LAYOUT = "wide landscape scene, soft light colors, simple background";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 줄마다 이름 하나 (쉼표로 구분해도 됨) */
const parseNames = (text: string) =>
  [...new Set(text.split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ").slice(0, 10)).filter(Boolean))];

export default function NameTagApp() {
  const [namesText, setNamesText] = useState("");
  const [label, setLabel] = useState("느티나무반");
  const [color, setColor] = useState<TagColor>("초록");
  const [art, setArt] = useState<string | undefined>();
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<"png" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // 시간표에서 입력해 둔 학생들을 처음 목록으로 사용
  useEffect(() => {
    const rows = loadRows() ?? [];
    const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSavedNames(names);
    setNamesText((t) => t || names.join("\n"));
  }, []);

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const tags = useMemo<NameTag[]>(
    () => (names.length ? names : [""]).map((name) => ({ name, label: label.trim(), color, art })),
    [names, label, color, art],
  );
  const svgs = useMemo(() => tags.map(nameTagSvg), [tags]);

  const withFonts = async () => {
    const css = await embeddedFontCss(nameTagText(tags));
    return svgs.map((svg) => withFont(svg, css));
  };

  const downloadZip = async () => {
    setBusy("png");
    setExportError(null);
    try {
      const zip = new JSZip();
      for (const [i, svg] of (await withFonts()).entries()) {
        zip.file(`${safeFileName(names[i])} 이름표.png`, await svgToPng(svg, TAG_W, TAG_H, 1.5));
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), "이름표.zip");
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
        title: "이름표",
        page: { w: 210, h: 297, css: "A4" },
        items: await withFonts(),
        itemMm: TAG_MM,
        cols: 2,
        rows: 5,
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleName = (n: string) =>
    setNamesText(names.includes(n) ? names.filter((x) => x !== n).join("\n") : [...names, n].join("\n"));

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">이름표 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          여러 학생의 이름표를 한꺼번에 만들어요. 배경 그림은 원하는 대로 AI가 무료로 그려 줘요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="nt-names">
              이름 <span className="font-normal text-slate-400">· 한 줄에 한 명</span>
            </label>
            <textarea
              id="nt-names"
              value={namesText}
              rows={5}
              placeholder={"강동아\n하초현"}
              onChange={(e) => setNamesText(e.target.value)}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            {savedNames.length > 0 && (
              <div className="mt-1.5">
                <p className="text-xs text-slate-400">시간표에 입력한 학생 (눌러서 넣고 빼기)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {savedNames.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleName(n)}
                      aria-pressed={names.includes(n)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                        names.includes(n) ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">위쪽 문구</span>
              <input value={label} maxLength={12} placeholder="비워도 돼요" onChange={(e) => setLabel(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">테두리 색</span>
              <select value={color} onChange={(e) => setColor(e.target.value as TagColor)} className={field}>
                {Object.keys(TAG_COLORS).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <AiArtPanel
            id="nt-art"
            examples={TAG_EXAMPLES}
            layout={TAG_LAYOUT}
            width={1200}
            height={736}
            hasArt={!!art}
            onArt={setArt}
          />

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={print}
              disabled={names.length === 0 || busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy === "print" && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장 (A4 한 장에 10개)
            </button>
            <button
              type="button"
              onClick={downloadZip}
              disabled={names.length === 0 || busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {busy === "png" ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              한 명씩 그림 파일로 저장 (ZIP)
            </button>
            {names.length === 0 && <p className="text-center text-xs text-slate-400">이름을 입력하면 저장할 수 있어요</p>}
            {exportError && (
              <p role="alert" className="text-center text-xs font-medium text-red-600">
                {exportError}
              </p>
            )}
          </div>
        </div>

        <section aria-label="이름표 미리보기" className="min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              {names.length ? `${names.length}명 · A4 ${Math.ceil(names.length / 10)}장` : "미리보기"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {svgs.map((svg, i) => (
                <div
                  key={`${names[i] ?? ""}-${i}`}
                  className="overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  // nameTagSvg 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
