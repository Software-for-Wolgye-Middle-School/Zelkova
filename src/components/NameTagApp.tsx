"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  BORDER_OPTIONS,
  ICON_OPTIONS,
  nameTagSheetSvgs,
  nameTagSvg,
  nameTagText,
  RAINBOW_CSS,
  SHEET_H,
  SHEET_W,
  TAG_MM,
  type IconId,
  type NameTag,
  type TagBorder,
} from "@/lib/nameTagSvg";
import { downloadBlob, embeddedFontCss, loadImageDataUrl, printSheets, svgToPng, withFont } from "@/lib/svgExport";
import { DownloadIcon, Spinner } from "./icons";
import { loadRows } from "./students";

const DEFAULT_ICON: IconId = "clover";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 줄마다 이름 하나 (쉼표로 구분해도 됨) */
const parseNames = (text: string) =>
  [...new Set(text.split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ").slice(0, 10)).filter(Boolean))];

export default function NameTagApp() {
  const [namesText, setNamesText] = useState("");
  const [label, setLabel] = useState("");
  const [defaultIcon, setDefaultIcon] = useState<IconId>(DEFAULT_ICON);
  /** 학생마다 따로 고른 아이콘 (이름 → 아이콘) */
  const [iconFor, setIconFor] = useState<Record<string, IconId>>({});
  /** 아이콘 그림 (아이콘 → data: 주소) */
  const [iconArt, setIconArt] = useState<Partial<Record<IconId, string>>>({});
  const [border, setBorder] = useState<TagBorder>("rainbow");
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

  useEffect(() => {
    for (const o of ICON_OPTIONS) {
      loadImageDataUrl(o.src, 400, true)
        .then((art) => setIconArt((m) => ({ ...m, [o.id]: art })))
        .catch((e) => console.error(e));
    }
  }, []);
  const iconsReady = ICON_OPTIONS.every((o) => iconArt[o.id]);

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const tags = useMemo<NameTag[]>(
    () =>
      (names.length ? names : [""]).map((name) => {
        const icon = iconFor[name] ?? defaultIcon;
        return { name, label: label.trim(), icon, art: iconArt[icon], border };
      }),
    [names, label, iconFor, defaultIcon, iconArt, border],
  );
  const svgs = useMemo(() => tags.map(nameTagSvg), [tags]);

  /** 전체 아이콘을 바꾸면 학생마다 따로 고른 것은 초기화 */
  const chooseDefault = (id: IconId) => {
    setDefaultIcon(id);
    setIconFor({});
  };

  const withFonts = async () => {
    const css = await embeddedFontCss(nameTagText(tags));
    return svgs.map((svg) => withFont(svg, css));
  };

  /** 인쇄와 같은 A4 배치로 저장. 한 장이면 PNG 하나, 여러 장이면 장마다 PNG 를 ZIP 으로 묶음 */
  const downloadImages = async () => {
    setBusy("png");
    setExportError(null);
    try {
      const css = await embeddedFontCss(nameTagText(tags));
      const sheets = nameTagSheetSvgs(svgs).map((svg) => withFont(svg, css));
      if (sheets.length === 1) {
        downloadBlob(await svgToPng(sheets[0], SHEET_W, SHEET_H, 1.5), "이름표.png");
        return;
      }
      const zip = new JSZip();
      for (const [i, svg] of sheets.entries()) {
        zip.file(`이름표 ${i + 1}장.png`, await svgToPng(svg, SHEET_W, SHEET_H, 1.5));
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
        rows: 7,
        cutLines: false, // 테두리를 따라 자르면 됨
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
          이름표를 여러 명 한꺼번에 만들어요. 테두리 색과 아이콘을 골라 보세요.
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

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-800">반 이름</span>
            <input value={label} maxLength={12} placeholder="비워도 돼요" onChange={(e) => setLabel(e.target.value)} className={field} />
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-800">테두리</p>
            <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="테두리">
              {BORDER_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={border === o.id}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => setBorder(o.id)}
                  style={{ background: o.id === "rainbow" ? RAINBOW_CSS : o.id }}
                  className={`h-8 w-8 rounded-full ring-offset-2 transition ${
                    border === o.id ? "ring-2 ring-indigo-500" : "ring-1 ring-slate-200 hover:ring-slate-300"
                  }`}
                />
              ))}
              {(() => {
                const custom = border !== "rainbow" && !BORDER_OPTIONS.some((o) => o.id === border);
                return (
                  <label
                    title="다른 색 고르기"
                    className={`relative flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-semibold ring-offset-2 transition ${
                      custom ? "text-white ring-2 ring-indigo-500" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
                    }`}
                    style={custom ? { background: border } : undefined}
                  >
                    다른 색
                    <input
                      type="color"
                      aria-label="테두리 색 직접 고르기"
                      value={border === "rainbow" ? "#f8829a" : border}
                      onChange={(e) => setBorder(e.target.value as TagBorder)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                );
              })()}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">아이콘</p>
            <p className="mt-0.5 text-xs text-slate-500">모든 이름표에 적용돼요. 학생마다 바꾸려면 미리보기 아래에서 고르세요.</p>
            <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="아이콘">
              {ICON_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={defaultIcon === o.id}
                  onClick={() => chooseDefault(o.id)}
                  className={`overflow-hidden rounded-lg border bg-white p-1.5 text-xs font-semibold text-slate-600 transition ${
                    defaultIcon === o.id ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- public 폴더의 작은 아이콘 */}
                  <img src={o.src} alt="" className="aspect-square w-full object-contain" />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={print}
              disabled={names.length === 0 || busy !== null || !iconsReady}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy === "print" && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장 (A4 한 장에 14개)
            </button>
            <button
              type="button"
              onClick={downloadImages}
              disabled={names.length === 0 || busy !== null || !iconsReady}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {busy === "png" ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              전체 그림 파일로 저장 (PNG)
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
          <p className="mb-2 text-xs font-semibold text-slate-500">
            {names.length ? `${names.length}명 · A4 ${Math.ceil(names.length / 14)}장` : "미리보기"}
          </p>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {tags.map((t, i) => (
              <div key={`${t.name}-${i}`}>
                <div
                  className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  // nameTagSvg 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                  dangerouslySetInnerHTML={{ __html: svgs[i] }}
                />
                {t.name && (
                  <select
                    aria-label={`${t.name} 아이콘`}
                    value={t.icon}
                    onChange={(e) => setIconFor((m) => ({ ...m, [t.name]: e.target.value as IconId }))}
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-indigo-500"
                  >
                    {ICON_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
