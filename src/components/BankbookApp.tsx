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
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, DownloadIcon, PlusIcon, Spinner, TrashIcon } from "./icons";
import {
  BACKGROUND_MAX_WIDTH,
  loadPhotoSets,
  MAX_BACKGROUND_FILE_BYTES,
  MAX_PHOTO_SETS,
  newPhotoSetId,
  savePhotoSets,
  type CustomPhotoSet,
} from "./customBackgrounds";
import type { Student } from "@/lib/timetable";

/** public/background 의 캐릭터 그림. 앞 그림은 표지, 뒤 그림(캐릭터 없는 같은 배경)은 뒤표지. paper 는 그 그림에 어울리는 속지 색 */
const PICTURES = [
  { key: "hello_kitty", label: "헬로키티", file: "hello_kitty/hellokitty", paper: "분홍" },
  { key: "pingu", label: "핑구", file: "pingu/pingu", paper: "하늘" },
  { key: "jerry", label: "제리", file: "jerry/jerry", paper: "노랑" },
  { key: "kurumi", label: "쿠루미", file: "kurumi/kurumi", paper: "보라" },
  { key: "smurf", label: "스머프", file: "smurf/smurf", paper: "하늘" },
  { key: "thomas", label: "토마스", file: "thomas/thomas", paper: "노랑" },
  { key: "conan", label: "코난", file: "conan/conan", paper: "남색" },
  { key: "cinamon", label: "시나모롤", file: "cinamon/cinamon", paper: "하늘" },
] as const satisfies readonly { key: string; label: string; file: string; paper: PaperColor }[];
/** 기본 그림의 key 또는 등록한 내 사진 세트의 id ("custom-…") */
type PictureKey = string;

const MAX_LEDGERS = 99;
const MAX_PREVIEW_SHEETS = 4;

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 통장을 만드는 순서 */
const STEPS = [
  { title: "배경", heading: "표지에 쓸 그림을 골라 주세요", hint: "" },
  { title: "이름", heading: "누구의 통장인가요?", hint: "등록된 학생을 누르거나 이름을 직접 적어 주세요." },
  { title: "통장 정보", heading: "통장에 들어갈 내용을 확인해 주세요", hint: "바뀐 것이 없으면 그대로 다음으로 넘어가도 돼요." },
  { title: "저장", heading: "크기를 정하고 저장해요", hint: "A4 종이에 놓을 크기를 정하고 PDF로 저장하세요." },
] as const;

/** 쪽 크기 바로 고르기: A4 한 장에 n쪽이 들어가는 가장 큰 크기 */
const SIZE_PRESETS = [1, 2, 4, 8].map((n) => ({ n, w: largestWidthFor(n) }));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BankbookApp({ students }: { students: Student[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("느티나무 은행");
  const [branch, setBranch] = useState("월계중학교");
  const [issued, setIssued] = useState(today);
  const [account, setAccount] = useState(() => `${today()}-01`);
  const [kind, setKind] = useState<Bankbook["kind"]>("신규");
  const [paper, setPaper] = useState<PaperColor>("분홍");
  const [ledgersText, setLedgersText] = useState("5");
  const [pageW, setPageW] = useState<number>(BOOK_MM.w);
  const [picture, setPicture] = useState<PictureKey>("hello_kitty");
  const [art, setArt] = useState<{ key: PictureKey; front: string; back: string } | null>(null);
  const [sets, setSets] = useState<CustomPhotoSet[]>([]);
  const [draft, setDraft] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [draftName, setDraftName] = useState("");
  const [bgError,setBgError] = useState<string | null>(null);
  const [addingSide, setAddingSide] = useState<"front" | "back" | null>(null);
  const savedNames = useMemo(() => [...new Set(students.map((s) => s.name))], [students]);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 브라우저에서만 읽을 수 있음
    setSets(loadPhotoSets());
  }, []);

  useEffect(() => {
    const custom = sets.find((c) => c.id === picture);
    if (custom) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 고른 그림에 맞춰 표지 · 뒤표지 그림을 바꿈
      setArt({ key: custom.id, front: custom.front, back: custom.back });
      return;
    }
    const pic = PICTURES.find((p) => p.key === picture);
    if (!pic) return; // 올린 사진을 아직 불러오는 중
    let cancelled = false;
    // 쪽을 크게 인쇄해도 흐리지 않도록 넉넉히 둠
    const load = (side: string) => loadImageDataUrl(`/background/${pic.file}_${side}.png`, BOOK_W * 3);
    Promise.all([load("front"), load("back")])
      .then(([front, back]) => !cancelled && setArt({ key: pic.key, front, back }))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [picture, sets]);

  const pictureArt = art?.key === picture ? art : null;
  const ledgers = Math.min(MAX_LEDGERS, Math.max(1, parseInt(ledgersText, 10) || 1));

  /** 기본 그림을 고르면 그 그림에 어울리는 속지 색으로 바꿈 */
  const choosePicture = (key: PictureKey) => {
    setPicture(key);
    const pic = PICTURES.find((p) => p.key === key);
    if (pic) setPaper(pic.paper);
  };
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

  /** 사진 파일을 골라 크기를 줄인 뒤 등록하려는 세트의 앞면 또는 뒷면에 넣음 */
  const readPhoto = async (side: "front" | "back", file: File | undefined) => {
    if (!file) return;
    setBgError(null);
    if (!file.type.startsWith("image/")) return setBgError("그림 파일(PNG, JPG 등)을 골라 주세요.");
    if (file.size > MAX_BACKGROUND_FILE_BYTES) return setBgError("파일이 너무 커요. 15MB 이하의 사진을 골라 주세요.");
    setAddingSide(side);
    const url = URL.createObjectURL(file);
    try {
      const data = await loadImageDataUrl(url, BACKGROUND_MAX_WIDTH);
      setDraft((d) => ({ ...d, [side]: data }));
    } catch (e) {
      console.error(e);
      setBgError("사진을 읽지 못했어요. 다른 파일로 다시 해 주세요.");
    } finally {
      URL.revokeObjectURL(url);
      setAddingSide(null);
    }
  };

  /** 앞면 · 뒷면이 모두 있으면 한 세트로 등록하고 바로 선택 */
  const registerSet = () => {
    if (!draft.front || !draft.back || !draftName.trim()) return;
    setBgError(null);
    if (sets.length >= MAX_PHOTO_SETS) return setBgError(`내 사진은 ${MAX_PHOTO_SETS}세트까지 등록할 수 있어요. 안 쓰는 세트를 지워 주세요.`);
    const set: CustomPhotoSet = { id: newPhotoSetId(), label: draftName.trim().slice(0, 12), front: draft.front, back: draft.back };
    const next = [...sets, set];
    if (!savePhotoSets(next)) return setBgError("브라우저 저장 공간이 부족해서 등록하지 못했어요. 안 쓰는 세트를 지워 보세요.");
    setSets(next);
    setDraft({ front: null, back: null });
    setDraftName("");
    setPicture(set.id);
  };

  const removeSet = (id: string) => {
    const next = sets.filter((c) => c.id !== id);
    setSets(next);
    savePhotoSets(next);
    if (picture === id) choosePicture(PICTURES[0].key); // 지운 세트를 쓰고 있었다면 기본 그림으로
  };

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

  const last = step === STEPS.length - 1;
  /** 이름을 적어야 이름 단계 다음으로 갈 수 있음 */
  const canNext = step === 0 ? !!pictureArt : step === 1 ? !!trimmed : true;
  const chip = (on: boolean) =>
    `rounded-lg px-2 py-2 text-sm font-semibold ring-1 ring-inset transition ${
      on ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
    }`;

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">칭찬통장 만들기</h1>
        <p className="mt-2 text-[15px] text-slate-500">배경 → 이름 → 통장 정보 → 저장, 네 단계로 차근차근 만들어요.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <ol className="flex items-center" aria-label="진행 단계">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-1 items-center last:flex-none" aria-current={i === step ? "step" : undefined}>
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  disabled={i > step}
                  className="flex flex-col items-center gap-1 disabled:cursor-default"
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition ${
                      i < step ? "bg-indigo-600 text-white" : i === step ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className={`text-[11px] font-semibold ${i <= step ? "text-slate-800" : "text-slate-400"}`}>{s.title}</span>
                </button>
                {i < STEPS.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 rounded ${i < step ? "bg-indigo-600" : "bg-slate-200"}`} />}
              </li>
            ))}
          </ol>

          <div>
            <h2 className="text-lg font-bold text-slate-900">{STEPS[step].heading}</h2>
            {STEPS[step].hint && <p className="mt-0.5 text-xs text-slate-500">{STEPS[step].hint}</p>}
          </div>

          {step === 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">기본 배경</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PICTURES.map((p) => (
                  <button key={p.key} type="button" onClick={() => choosePicture(p.key)} aria-pressed={picture === p.key} className={chip(picture === p.key)}>
                    {p.label}
                  </button>
                ))}
                {sets.map((c) => (
                  <div key={c.id} className="relative">
                    <button type="button" onClick={() => setPicture(c.id)} aria-pressed={picture === c.id} className={`w-full truncate pr-6 ${chip(picture === c.id)}`}>
                      {c.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSet(c.id)}
                      aria-label={`${c.label} 지우기`}
                      className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <p className="mb-1.5 mt-4 text-xs font-semibold text-slate-600">
                내 사진 <span className="font-normal text-slate-400">· 앞면 · 뒷면 2장과 이름을 넣으면 위 목록에 추가돼요 ({sets.length}/{MAX_PHOTO_SETS})</span>
              </p>
              {sets.length < MAX_PHOTO_SETS && (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["front", "back"] as const).map((side) => {
                      const src = draft[side];
                      const label = side === "front" ? "앞면" : "뒷면";
                      return src ? (
                        <div key={side} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진(data: 주소) */}
                          <img src={src} alt={`등록할 ${label} 사진`} className="aspect-[4/3] w-full rounded-lg border border-slate-200 object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{label}</span>
                          <button
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, [side]: null }))}
                            aria-label={`${label} 사진 빼기`}
                            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-500 shadow ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label
                          key={side}
                          className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-1.5 text-center text-xs font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 ${
                            addingSide ? "pointer-events-none opacity-60" : ""
                          }`}
                        >
                          {addingSide === side ? <Spinner className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}
                          {label} 사진 추가
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              void readPhoto(side, e.target.files?.[0]);
                              e.target.value = ""; // 같은 파일을 다시 골라도 반응하도록
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <input
                    value={draftName}
                    maxLength={12}
                    placeholder="배경 이름 (예: 우리 반)"
                    aria-label="배경 이름"
                    onChange={(e) => setDraftName(e.target.value)}
                    className={`mt-1.5 ${field}`}
                  />
                  <button
                    type="button"
                    onClick={registerSet}
                    disabled={!draft.front || !draft.back || !draftName.trim()}
                    className="mt-1.5 w-full rounded-lg bg-indigo-600 px-2 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {!draft.front || !draft.back ? "앞면 · 뒷면을 모두 올려 주세요" : !draftName.trim() ? "배경 이름을 입력해 주세요" : "기본 배경으로 등록하기"}
                  </button>
                </>
              )}
              {bgError && (
                <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                  {bgError}
                </p>
              )}
              {!pictureArt && (PICTURES.some((p) => p.key === picture) || sets.some((c) => c.id === picture)) && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Spinner className="h-3.5 w-3.5" /> 그림을 불러오고 있어요
                </p>
              )}
            </div>
          )}

          {step === 1 && (
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
              {savedNames.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
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
              ) : (
                <p className="mt-2 text-xs text-slate-400">‘학생 정보 관리하기’에 학생을 등록해 두면 여기서 바로 고를 수 있어요.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
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
                <Field label="거래 내역 쪽수">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_LEDGERS}
                    value={ledgersText}
                    onChange={(e) => setLedgersText(e.target.value)}
                    onBlur={() => setLedgersText(String(ledgers))}
                    className={field}
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="bb-size" className="text-sm font-semibold text-slate-800">
                  쪽 크기
                </label>
                <span className="text-xs font-semibold text-indigo-700">
                  {layout.page.w} × {layout.page.h}mm
                </span>
              </div>
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
                  <button key={p.n} type="button" onClick={() => setPageW(p.w)} aria-pressed={pageW === p.w} className={chip(pageW === p.w)}>
                    {p.n}쪽
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                표지 · 속지 · 거래 내역 {ledgers}쪽 · 뒤표지를 A4 {layout.orientation === "landscape" ? "가로" : "세로"} 한 장에 {layout.perSheet}쪽씩 놓아
                모두 {sheets}장이에요.
              </p>
              <button
                type="button"
                onClick={savePdf}
                disabled={!trimmed || busy || !book}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
                PDF로 저장하기
              </button>
              {exportError && (
                <p role="alert" className="mt-2 text-center text-xs font-medium text-red-600">
                  {exportError}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:invisible"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              이전
            </button>
            {!last && (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                다음
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          {step === 1 && !trimmed && <p className="-mt-3 text-center text-xs text-slate-400">이름을 입력하면 다음으로 넘어갈 수 있어요</p>}
        </div>

        <section aria-label="칭찬통장 미리보기" className="min-w-0 space-y-4">
          {/* 앞면 · 속지 · 거래 내역 · 뒷면 (거래 내역은 모든 쪽이 같음) */}
          {step === 3 && (
            <div className="space-y-4">
              {Array.from({ length: Math.min(sheets, MAX_PREVIEW_SHEETS) }, (_, s) => (
                <figure key={s} className="rounded-2xl border border-slate-200 bg-slate-100 p-3 sm:p-5">
                  <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                    A4 {layout.orientation === "landscape" ? "가로" : "세로"} {s + 1}/{sheets}장 · 한 쪽 {layout.page.w} × {layout.page.h}mm
                  </figcaption>
                  <div
                    className="relative mx-auto bg-white shadow-md"
                    style={{ aspectRatio: `${layout.paper.w} / ${layout.paper.h}`, maxWidth: layout.orientation === "landscape" ? 640 : 452 }}
                  >
                    {pages.slice(s * layout.perSheet, (s + 1) * layout.perSheet).map((p, slot) => (
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
              ))}
              {sheets > MAX_PREVIEW_SHEETS && <p className="text-center text-xs text-slate-400">미리보기는 처음 {MAX_PREVIEW_SHEETS}장까지만 보여 줘요. PDF에는 모두 들어가요.</p>}
            </div>
          )}

          <div className={`grid gap-4 sm:grid-cols-2 ${step === 3 ? "hidden" : ""}`}>
            {pages
              .filter((p) => !p.key.startsWith("ledger") || p.key === "ledger-0")
              .map((p) => (
                <figure key={p.key} className="rounded-2xl border border-slate-200 bg-slate-100 p-3">
                  <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                    {p.key === "cover" ? "앞면" : p.key === "back" ? "뒷면" : p.key.startsWith("ledger") ? `거래 내역 (${ledgers}쪽)` : p.label}
                  </figcaption>
                  <div
                    className="overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    // bankbookPages 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
                    dangerouslySetInnerHTML={{ __html: p.svg }}
                  />
                </figure>
              ))}
          </div>
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
