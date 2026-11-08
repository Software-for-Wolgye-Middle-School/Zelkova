"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BORDER_OPTIONS,
  ICON_OPTIONS,
  nameTagSheetSvgs,
  nameTagSvg,
  nameTagText,
  RAINBOW_CSS,
  SHEET_H,
  SHEET_W,
  type NameTag,
  type TagBorder,
} from "@/lib/nameTagSvg";
import { downloadBlob, embeddedFontCss, loadImageDataUrl, svgToPng, withFont } from "@/lib/svgExport";
import NameCombobox from "./NameCombobox";
import { DownloadIcon, PlusIcon, Spinner, TrashIcon, XIcon } from "./icons";
import { StepHeading, StepNav, StepProgress, useStepFlow } from "./StepFlow";
import {
  loadCustomIcons,
  MAX_CUSTOM_ICONS,
  MAX_ICON_FILE_BYTES,
  newIconId,
  saveCustomIcons,
  type CustomIcon,
} from "./customIcons";
import type { Student } from "@/lib/timetable";

const DEFAULT_ICON = "clover";

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 쉼표나 줄바꿈으로 여러 명을 한 번에 붙여 넣어도 됨 */
const parseNames = (text: string) => text.split(/[\n,]/).map((s) => s.trim().replace(/\s+/g, " ").slice(0, 10)).filter(Boolean);

/** 이름표를 만드는 순서 */
const STEPS = [
  { title: "이름", heading: "누구의 이름표인가요?", hint: "이름을 쓰고 Enter를 누르거나 목록에서 고르면 추가돼요. 여러 명을 넣을 수 있어요." },
  {
    title: "반 이름",
    heading: (
      <>
        반 이름을 적어 주세요 <span className="text-xs font-normal text-slate-500">(선택)</span>
      </>
    ),
    hint: "",
  },
  { title: "꾸미기", heading: "아이콘과 테두리를 골라 주세요", hint: "" },
] as const;

export default function NameTagApp({ students }: { students: Student[] }) {
  const { step, checking, goStep, goNext, fadeClass } = useStepFlow();
  const [names, setNames] = useState<string[]>([]);
  const [pending, setPending] = useState("");
  /** '등록된 학생 모두 추가'로 넣었으면 아래 이름 목록을 보여 주지 않음 (이름을 모두 지우면 다시 보여 줌) */
  const [bulkAdded, setBulkAdded] = useState(false);
  const [label, setLabel] = useState("");
  const [defaultIcon, setDefaultIcon] = useState(DEFAULT_ICON);
  /** 학생마다 따로 고른 아이콘 (이름 → 아이콘) */
  const [iconFor, setIconFor] = useState<Record<string, string>>({});
  /** 아이콘 그림 (아이콘 → data: 주소) */
  const [iconArt, setIconArt] = useState<Record<string, string>>({});
  /** 직접 등록한 이모티콘 */
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [iconError, setIconError] = useState<string | null>(null);
  const [addingIcon, setAddingIcon] = useState(false);
  const [border, setBorder] = useState<TagBorder>("rainbow");
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 학생 정보 관리에 등록해 둔 학생 이름으로 자동완성 (이미 넣은 이름은 빼고)
  const savedNames = useMemo(
    () => [...new Set(students.map((s) => s.name))].filter((n) => !names.includes(n)).sort((a, b) => a.localeCompare(b, "ko")),
    [students, names],
  );
  /** 입력칸의 이름(들)을 목록에 넣고 입력칸을 비움 */
  const addNames = (text: string) => {
    const added = parseNames(text);
    if (added.length) setNames((list) => [...new Set([...list, ...added])]);
    setPending("");
  };
  const removeName = (n: string) => {
    const rest = names.filter((x) => x !== n);
    setNames(rest);
    if (!rest.length) setBulkAdded(false);
  };

  useEffect(() => {
    for (const o of ICON_OPTIONS) {
      loadImageDataUrl(o.src, 400, true)
        .then((art) => setIconArt((m) => ({ ...m, [o.id]: art })))
        .catch((e) => console.error(e));
    }
  }, []);
  const iconsReady = ICON_OPTIONS.every((o) => iconArt[o.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setCustomIcons(loadCustomIcons());
  }, []);

  /** 기본 아이콘과 등록한 이모티콘 모두 */
  const iconOptions = useMemo(
    () => [...ICON_OPTIONS.map((o) => ({ id: o.id as string, label: o.label, src: o.src })), ...customIcons.map((c) => ({ id: c.id, label: c.label, src: c.art }))],
    [customIcons],
  );
  const artOf = (id: string) => iconArt[id] ?? customIcons.find((c) => c.id === id)?.art;

  /** 그림 파일을 골라 작게 줄인 뒤 내 이모티콘으로 등록 */
  const addCustomIcon = async (file: File | undefined) => {
    if (!file) return;
    setIconError(null);
    if (!file.type.startsWith("image/")) return setIconError("그림 파일(PNG, JPG 등)을 골라 주세요.");
    if (file.size > MAX_ICON_FILE_BYTES) return setIconError("파일이 너무 커요. 10MB 이하의 그림을 골라 주세요.");
    if (customIcons.length >= MAX_CUSTOM_ICONS) return setIconError(`이모티콘은 ${MAX_CUSTOM_ICONS}개까지 등록할 수 있어요. 안 쓰는 것을 지워 주세요.`);
    setAddingIcon(true);
    const url = URL.createObjectURL(file);
    try {
      const art = await loadImageDataUrl(url, 400, true);
      const icon: CustomIcon = { id: newIconId(), label: file.name.replace(/\.[^.]+$/, "").trim().slice(0, 12) || "내 이모티콘", art };
      const next = [...customIcons, icon];
      if (!saveCustomIcons(next)) return setIconError("브라우저 저장 공간이 부족해서 등록하지 못했어요. 안 쓰는 이모티콘을 지워 보세요.");
      setCustomIcons(next);
      chooseDefault(icon.id);
    } catch (e) {
      console.error(e);
      setIconError("그림을 읽지 못했어요. 다른 파일로 다시 해 주세요.");
    } finally {
      URL.revokeObjectURL(url);
      setAddingIcon(false);
    }
  };

  const removeCustomIcon = (id: string) => {
    const next = customIcons.filter((c) => c.id !== id);
    setCustomIcons(next);
    saveCustomIcons(next);
    // 지운 이모티콘을 쓰던 이름표는 기본 아이콘으로 되돌림
    if (defaultIcon === id) setDefaultIcon(DEFAULT_ICON);
    setIconFor((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== id)));
  };

  const tags = useMemo<NameTag[]>(
    () =>
      (names.length ? names : [""]).map((name) => {
        const icon = iconFor[name] ?? defaultIcon;
        return { name, label: label.trim(), icon, art: iconArt[icon] ?? customIcons.find((c) => c.id === icon)?.art, border };
      }),
    [names, label, iconFor, defaultIcon, iconArt, customIcons, border],
  );
  const svgs = useMemo(() => tags.map(nameTagSvg), [tags]);

  /** 전체 아이콘을 바꾸면 학생마다 따로 고른 것은 초기화 */
  const chooseDefault = (id: string) => {
    setDefaultIcon(id);
    setIconFor({});
  };

  /** 인쇄용 A4 배치(한 장에 14개)로 모든 이름표를 PDF 하나에 담아 내려받음 */
  const download = async () => {
    setBusy(true);
    setExportError(null);
    try {
      const [{ jsPDF }, css] = await Promise.all([import("jspdf"), embeddedFontCss(nameTagText(tags))]);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (const [i, svg] of nameTagSheetSvgs(svgs).entries()) {
        if (i > 0) doc.addPage();
        const jpeg = await svgToPng(withFont(svg, css), SHEET_W, SHEET_H, 1, "image/jpeg");
        doc.addImage(new Uint8Array(await jpeg.arrayBuffer()), "JPEG", 0, 0, 210, 297, `sheet-${i}`);
      }
      downloadBlob(doc.output("blob"), "이름표.pdf");
    } catch (e) {
      console.error(e);
      setExportError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const last = step === STEPS.length - 1;
  // 입력칸에 쓰고 아직 추가하지 않은 이름도 '다음'을 누르면 넣음
  const canNext = step === 0 ? names.length > 0 || !!pending.trim() : true;
  const next = () => {
    if (step === 0 && pending.trim()) addNames(pending);
    goNext();
  };

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">이름표 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          이름표를 여러 명 한꺼번에 만들어요. 테두리 색과 아이콘을 골라 보세요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 overflow-x-clip rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <StepProgress steps={STEPS} step={step} checking={checking} onGo={goStep} />

          <div className={`space-y-5 ${fadeClass}`}>
          <StepHeading step={STEPS[step]} />

          {step === 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="nt-name">
                이름
              </label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <NameCombobox
                    id="nt-name"
                    value={pending}
                    onChange={setPending}
                    onSubmit={addNames}
                    names={savedNames}
                    maxLength={60}
                    placeholder="예: 이순신"
                    className={field}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addNames(pending)}
                  disabled={!pending.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <PlusIcon className="h-4 w-4" />
                  추가
                </button>
              </div>
              {savedNames.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    addNames(savedNames.join("\n"));
                    setBulkAdded(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  등록된 학생 모두 추가 ({savedNames.length}명)
                </button>
              )}
              {names.length > 0 && !bulkAdded && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">넣은 이름 {names.length}명</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="넣은 이름">
                    {names.map((n) => (
                      <li key={n} className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                        {n}
                        <button
                          type="button"
                          onClick={() => removeName(n)}
                          aria-label={`${n} 빼기`}
                          className="grid h-4 w-4 place-items-center rounded-full text-indigo-400 transition hover:bg-indigo-100 hover:text-indigo-700"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">반 이름</span>
              <input value={label} maxLength={12} placeholder="예: 느티나무반 (비워도 돼요)" onChange={(e) => setLabel(e.target.value)} className={field} />
            </label>
          )}

          {step === 2 && (
          <>
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
              {iconOptions.map((o) => {
                const custom = o.id.startsWith("custom-");
                return (
                  <div key={o.id} className="relative">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={defaultIcon === o.id}
                      onClick={() => chooseDefault(o.id)}
                      className={`block w-full overflow-hidden rounded-lg border bg-white p-1.5 text-xs font-semibold text-slate-600 transition ${
                        defaultIcon === o.id ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 작은 아이콘 그림 */}
                      <img src={o.src} alt="" className="aspect-square w-full object-contain" />
                      <span className="block truncate">{o.label}</span>
                    </button>
                    {custom && (
                      <button
                        type="button"
                        onClick={() => removeCustomIcon(o.id)}
                        aria-label={`${o.label} 이모티콘 지우기`}
                        className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-500 shadow ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <label
                className={`flex aspect-auto min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-1.5 text-center text-xs font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 ${
                  addingIcon ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {addingIcon ? <Spinner className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}
                내 이모티콘 등록
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    void addCustomIcon(e.target.files?.[0]);
                    e.target.value = ""; // 같은 파일을 다시 골라도 반응하도록
                  }}
                />
              </label>
            </div>
            {iconError && (
              <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                {iconError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={download}
              disabled={names.length === 0 || busy || !iconsReady}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
              다운로드하기
            </button>
            {exportError && (
              <p role="alert" className="text-center text-xs font-medium text-red-600">
                {exportError}
              </p>
            )}
          </div>
          </>
          )}
          </div>

          <StepNav
            step={step}
            last={last}
            canNext={canNext}
            checking={checking}
            onPrev={() => goStep(step - 1)}
            onNext={next}
            invalidMessage="이름을 한 명 이상 넣어 주세요."
          />
        </div>

        <section aria-label="이름표 미리보기" className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            {names.length ? `${names.length}명 · A4 ${Math.ceil(names.length / 14)}장` : "미리보기"}
          </p>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {tags.map((t, i) => (
              <div key={`${t.name}-${i}`}>
                <div className="relative">
                  <div
                    className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    // nameTagSvg 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                    dangerouslySetInnerHTML={{ __html: svgs[i] }}
                  />
                  {t.name && (
                    <button
                      type="button"
                      onClick={() => removeName(t.name)}
                      aria-label={`${t.name} 이름표 지우기`}
                      className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-500 shadow ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {t.name && step === 2 && (
                  <select
                    aria-label={`${t.name} 아이콘`}
                    value={t.icon}
                    onChange={(e) => setIconFor((m) => ({ ...m, [t.name]: e.target.value }))}
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-indigo-500"
                  >
                    {iconOptions.map((o) => (
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
