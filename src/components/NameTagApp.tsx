"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  BORDER_OPTIONS,
  CHAR_OPTIONS,
  characterIconSvg,
  nameTagSvg,
  nameTagText,
  RAINBOW_CSS,
  TAG_H,
  TAG_MM,
  TAG_W,
  type CharId,
  type NameTag,
  type TagBorder,
} from "@/lib/nameTagSvg";
import { downloadBlob, embeddedFontCss, printSheets, safeFileName, svgToPng, withFont } from "@/lib/svgExport";
import AiArtPanel, { type ArtExample } from "./AiArtPanel";
import { DownloadIcon, SparkleIcon, Spinner } from "./icons";
import { loadRows } from "./students";

const CHAR_EXAMPLES: ArtExample[] = [
  { label: "곰돌이", prompt: "동그란 귀를 가진 귀여운 갈색 곰돌이 얼굴" },
  { label: "토끼", prompt: "분홍 볼을 가진 귀여운 하얀 토끼 얼굴" },
  { label: "고양이", prompt: "웃고 있는 귀여운 노란 고양이 얼굴" },
  { label: "공룡", prompt: "웃고 있는 귀여운 초록 아기 공룡 얼굴" },
  { label: "한복 아이", prompt: "댕기 머리를 한 귀여운 한복 입은 아이 얼굴" },
];
/** 이름표 카드 안 왼쪽에 들어갈 캐릭터 하나만, 흰 바탕으로 그리게 함 */
const CHAR_LAYOUT =
  "a single cute character head icon only, front view, centered, isolated on a plain pure white background, sticker style, nothing else in the picture";

const DEFAULT_CHAR: CharId = "girl-보라";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 줄마다 이름 하나 (쉼표로 구분해도 됨) */
const parseNames = (text: string) =>
  [...new Set(text.split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ").slice(0, 10)).filter(Boolean))];

export default function NameTagApp() {
  const [namesText, setNamesText] = useState("");
  const [label, setLabel] = useState("");
  const [defaultChar, setDefaultChar] = useState<CharId>(DEFAULT_CHAR);
  /** 학생마다 따로 고른 캐릭터 (이름 → 캐릭터) */
  const [charFor, setCharFor] = useState<Record<string, CharId>>({});
  const [art, setArt] = useState<string | undefined>();
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

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const tags = useMemo<NameTag[]>(
    () =>
      (names.length ? names : [""]).map((name) => ({
        name,
        label: label.trim(),
        char: charFor[name] ?? defaultChar,
        art,
        border,
      })),
    [names, label, charFor, defaultChar, art, border],
  );
  const svgs = useMemo(() => tags.map(nameTagSvg), [tags]);

  const changeArt = (next: string | undefined) => {
    setArt(next);
    if (next) {
      setDefaultChar("ai");
    } else {
      // AI 그림을 지우면 AI 캐릭터를 고른 곳은 기본 캐릭터로 되돌림
      setDefaultChar((c) => (c === "ai" ? DEFAULT_CHAR : c));
      setCharFor((m) => Object.fromEntries(Object.entries(m).filter(([, c]) => c !== "ai")));
    }
  };

  /** 전체 캐릭터를 바꾸면 학생마다 따로 고른 것은 초기화 */
  const chooseDefault = (id: CharId) => {
    setDefaultChar(id);
    setCharFor({});
  };

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
        rows: 7,
        cutLines: false, // 테두리를 따라 자르면 됨
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleName = (n: string) =>
    setNamesText(names.includes(n) ? names.filter((x) => x !== n).join("\n") : [...names, n].join("\n"));

  const charChoices = art ? [...CHAR_OPTIONS, { id: "ai" as const, label: "AI 캐릭터" }] : CHAR_OPTIONS;

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">이름표 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          이름표를 여러 명 한꺼번에 만들어요. 테두리 색과 캐릭터를 고르거나 AI로 새로 그릴 수 있어요.
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
            <p className="text-sm font-semibold text-slate-800">캐릭터</p>
            <p className="mt-0.5 text-xs text-slate-500">모든 이름표에 적용돼요. 학생마다 바꾸려면 미리보기 아래에서 고르세요.</p>
            <div className="mt-2 grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="캐릭터">
              {charChoices.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={defaultChar === o.id}
                  aria-label={o.label}
                  title={o.label}
                  onClick={() => chooseDefault(o.id)}
                  className={`aspect-square overflow-hidden rounded-lg border bg-white p-0.5 transition ${
                    defaultChar === o.id ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {o.id === "ai" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- AI로 받은 data: 주소
                    <img src={art} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span
                      className="block h-full w-full [&>svg]:h-full [&>svg]:w-full"
                      // characterIconSvg 는 고정된 값으로 직접 만든 SVG 문자열
                      dangerouslySetInnerHTML={{ __html: characterIconSvg(o.id) }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <AiArtPanel
            id="nt-art"
            title="AI 캐릭터 그리기"
            examples={CHAR_EXAMPLES}
            layout={CHAR_LAYOUT}
            width={640}
            height={640}
            hasArt={!!art}
            onArt={changeArt}
            transparent
          />

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={print}
              disabled={names.length === 0 || busy !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy === "print" && <Spinner className="h-5 w-5" />}
              인쇄 · PDF로 저장 (A4 한 장에 14개)
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
                    aria-label={`${t.name} 캐릭터`}
                    value={t.char}
                    onChange={(e) => setCharFor((m) => ({ ...m, [t.name]: e.target.value as CharId }))}
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-indigo-500"
                  >
                    {charChoices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          {!art && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <SparkleIcon className="h-3.5 w-3.5" />
              AI 캐릭터는 이름표 안 왼쪽 그림 자리에만 들어가요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
