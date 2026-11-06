"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  a4Layout,
  BOOK_H,
  BOOK_MM,
  BOOK_W,
  bankbookPages,
  bankbookText,
  largestWidthFor,
  PAPER_COLORS,
  type Bankbook,
  type PaperColor,
} from "@/lib/bankbookSvg";
import { embeddedFontCss, loadImageDataUrl, safeFileName, svgToPng, withFont } from "@/lib/svgExport";
import ImportStudentsButton from "./ImportStudentsButton";
import NameCombobox from "./NameCombobox";
import { CheckIcon, DownloadIcon, PlusIcon, Spinner, TrashIcon, XIcon } from "./icons";
import { SlideCarousel, StepHeading, StepNav, StepProgress, useStepFlow } from "./StepFlow";
import {
  BACKGROUND_MAX_WIDTH,
  deletePhotoSet,
  fetchPhotoSets,
  MAX_BACKGROUND_FILE_BYTES,
  MAX_PHOTO_SETS,
  registerPhotoSet,
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
  { key: "chiikawa", label: "치이카와", file: "chiikawa/chiikawa", paper: "하늘" },
] as const satisfies readonly { key: string; label: string; file: string; paper: PaperColor }[];
/** 기본 그림의 key 또는 등록한 내 사진 세트의 id ("custom-…") */
type PictureKey = string;

const BLANK_ART = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271%27 height=%271%27%3E%3Crect width=%271%27 height=%271%27 fill=%27%23fff%27/%3E%3C/svg%3E";
const MAX_LEDGERS = 99;

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

/** 통장을 만드는 순서 */
const STEPS = [
  { title: "배경", heading: "표지에 쓸 그림을 골라 주세요", hint: "" },
  { title: "이름", heading: "누구의 통장인가요?", hint: "" },
  { title: "통장 정보", heading: "통장에 들어갈 내용을 확인해 주세요", hint: "" },
  { title: "거래 내역", heading: "거래 내역은 몇 쪽으로 할까요?", hint: "" },
  { title: "완료", heading: "통장을 더 만들까요?", hint: "다른 학생 통장을 더 만들거나, 지금까지 만든 통장을 PDF 파일 하나로 내려받아요." },
] as const;
const DONE_STEP = STEPS.length - 1;

/** 쪽 크기는 A4 한 장에 4쪽이 들어가는 크기로 고정 */
const LAYOUT = a4Layout(largestWidthFor(4));

/** 단계별로 미리보기에 보이는 화면. 같은 화면이면 단계를 옮겨도 미리보기를 다시 불러오지 않음 */
const previewView = (step: number) => (step === 1 || step === 2 ? "info" : step === 3 ? "ledger" : step === DONE_STEP ? "download" : "all");

/** 다른 학생 통장을 만들 때 계좌번호 끝 숫자를 하나 올림 (…-01 → …-02) */
const nextAccount = (account: string) =>
  account.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, "0"));

/** 한 학생 통장을 만들 때 고른 값들 (다른 학생을 추가했다가 취소하면 되돌림) */
type Draft = {
  name: string;
  bank: string;
  branch: string;
  issued: string;
  account: string;
  kind: Bankbook["kind"];
  paper: PaperColor;
  ledgersText: string;
  picture: PictureKey;
};
/** 다 만든 통장 */
type SavedBook = { id: number; draft: Draft; book: Bankbook; ledgers: number; pictureLabel: string };
/** 내려받을 통장 목록의 한 줄: 다 만든 통장 또는 지금 만드는 통장 */
type Entry = { kind: "saved"; saved: SavedBook } | { kind: "current" };
/** 지금 만드는 통장을 목록 맨 끝에 둠 */
const AT_END = Number.MAX_SAFE_INTEGER;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BankbookApp({ students, onLoadStudents }: { students: Student[]; onLoadStudents: () => Promise<Student[] | null> }) {
  const { step, fadeFrom, fadeTo, checking, goStep, goNext, fadeClass } = useStepFlow();
  const [name, setName] = useState("");
  const [bank, setBank] = useState("느티나무 은행");
  const [branch, setBranch] = useState("월계중학교");
  const [issued, setIssued] = useState(today);
  const [account, setAccount] = useState(() => `${today()}-01`);
  const [kind, setKind] = useState<Bankbook["kind"]>("신규");
  const [paper, setPaper] = useState<PaperColor>("분홍");
  const [ledgersText, setLedgersText] = useState("5");
  const [picture, setPicture] = useState<PictureKey>("hello_kitty");
  const [art, setArt] = useState<{ key: PictureKey; front: string; back: string } | null>(null);
  const [sets, setSets] = useState<CustomPhotoSet[]>([]);
  const [draft, setDraft] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [customOpen, setCustomOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPaper, setDraftPaper] = useState<PaperColor>("노랑");
  const [bgError, setBgError] = useState<string | null>(null);
  const [addingSide, setAddingSide] = useState<"front" | "back" | null>(null);
  const savedNames = useMemo(() => [...new Set(students.map((s) => s.name))].sort((a, b) => a.localeCompare(b, "ko")), [students]);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedBook[]>([]);
  /** 지금 만드는 통장이 목록에서 놓인 자리 (그 앞에 있는 다 만든 통장 수) */
  const [currentAt, setCurrentAt] = useState(AT_END);
  /** 마지막으로 '더 만들기'를 눌러 넣은 통장 ('추가 그만하기'로 되돌릴 때) */
  const lastAddedId = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    fetchPhotoSets().then(setSets).catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const custom = sets.find((c) => c.id === picture);
    const pic = PICTURES.find((p) => p.key === picture);
    const target = custom ? { key: custom.id, front: custom.front, back: custom.back } : pic ? { key: pic.key, front: `/background/${pic.file}_front.png`, back: `/background/${pic.file}_back.png` } : null;
    if (!target) return; // 등록한 배경 목록을 아직 불러오는 중
    let cancelled = false;
    // 쪽을 크게 인쇄해도 흐리지 않도록 넉넉히 둠
    Promise.all([loadImageDataUrl(target.front, BOOK_W * 3), loadImageDataUrl(target.back, BOOK_W * 3)])
      .then(([front, back]) => !cancelled && setArt({ key: target.key, front, back }))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [picture, sets]);

  useEffect(() => {
    if (!customOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCustomOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customOpen]);

  const pictureArt = art?.key === picture ? art : null;
  const ledgers = Math.min(MAX_LEDGERS, Math.max(1, parseInt(ledgersText, 10) || 1));

  /** 기본 그림을 고르면 그 그림에 어울리는 속지 색으로 바꿈 */
  const choosePicture = (key: PictureKey) => {
    setPicture(key);
    const pic = PICTURES.find((p) => p.key === key);
    if (pic) setPaper(pic.paper);
  };
  /** 내 사진 세트를 고르면 등록할 때 정한 속지 색으로 바꿈 */
  const pickSet = (set: CustomPhotoSet) => {
    setPicture(set.id);
    setPaper(set.paper);
  };
  // 내 사진 등록 창에서는 올린 사진만 보여 줌 (고르던 배경이 섞여 보이지 않도록)
  const cover = customOpen ? (draft.front ?? undefined) : pictureArt?.front;
  const back = customOpen ? (draft.back ?? undefined) : pictureArt?.back;
  const previewPaper = customOpen ? draftPaper : paper;
  // 등록 창에서는 사진을 아직 안 올린 쪽도 속지 · 거래 내역을 먼저 보여 주려고 빈 그림으로 채움
  const blankArt = customOpen ? BLANK_ART : undefined;
  const layout = LAYOUT;

  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 10);
  const book = useMemo<Bankbook | null>(
    () =>
      (cover ?? blankArt) && (back ?? blankArt)
        ? { name: trimmed, bank: bank.trim(), branch: branch.trim(), account: account.trim(), issued, kind, paper: previewPaper, cover: (cover ?? blankArt)!, back: (back ?? blankArt)! }
        : null,
    [trimmed, bank, branch, account, issued, kind, previewPaper, cover, back, blankArt],
  );
  const pages = useMemo(() => (book ? bankbookPages(book, ledgers) : []), [book, ledgers]);

  const pictureLabel = sets.find((c) => c.id === picture)?.label ?? PICTURES.find((p) => p.key === picture)?.label ?? "";
  /** 내려받을 통장 목록 (끌어서 바꾼 순서 그대로) */
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = saved.map((b) => ({ kind: "saved", saved: b }));
    list.splice(Math.min(currentAt, saved.length), 0, { kind: "current" });
    return list;
  }, [saved, currentAt]);
  /** 내려받을 통장: 목록 순서대로 (지금 만드는 통장은 그림을 불러온 뒤에) */
  const books = useMemo(
    () =>
      entries.flatMap((e) =>
        e.kind === "saved" ? [{ name: e.saved.draft.name, book: e.saved.book, ledgers: e.saved.ledgers }] : book ? [{ name: trimmed, book, ledgers }] : [],
      ),
    [entries, book, trimmed, ledgers],
  );
  /** 미리보기 · PDF 의 A4 장들. 학생마다 새 장에서 시작 */
  const sheetList = useMemo(
    () =>
      books.flatMap((b) => {
        const all = bankbookPages(b.book, b.ledgers);
        const count = Math.ceil(all.length / layout.perSheet);
        return Array.from({ length: count }, (_, i) => ({ name: b.name, no: i + 1, count, pages: all.slice(i * layout.perSheet, (i + 1) * layout.perSheet) }));
      }),
    [books, layout],
  );

  const snapshot = (): Draft => ({ name: trimmed, bank, branch, issued, account, kind, paper, ledgersText, picture });
  const restore = (d: Draft) => {
    setName(d.name);
    setBank(d.bank);
    setBranch(d.branch);
    setIssued(d.issued);
    setAccount(d.account);
    setKind(d.kind);
    setPaper(d.paper);
    setLedgersText(d.ledgersText);
    setPicture(d.picture);
  };
  /** 지금 통장을 다 만든 통장에 넣고, 이름만 비운 채 배경 단계부터 다음 학생 통장을 만듦 */
  const addAnother = () => {
    if (!book) return;
    const done: SavedBook = { id: nextId.current++, draft: snapshot(), book, ledgers, pictureLabel };
    lastAddedId.current = done.id;
    goStep(0, () => {
      // 지금 통장이 놓였던 자리에 그대로 넣고, 새로 만들 통장은 맨 끝에
      setSaved((list) => [...list.slice(0, currentAt), done, ...list.slice(currentAt)]);
      setCurrentAt(AT_END);
      setName("");
      setAccount(nextAccount(account));
      setExportError(null);
    });
  };
  /** 다음 학생 추가를 그만두고 마지막으로 만든 통장으로 돌아가 완료 단계로 */
  const cancelAdd = () => {
    const lastBook = saved.find((b) => b.id === lastAddedId.current) ?? saved[saved.length - 1];
    if (!lastBook) return;
    const at = saved.indexOf(lastBook);
    goStep(DONE_STEP, () => {
      // 되돌린 통장은 목록에서 원래 있던 자리로
      setSaved((list) => list.filter((b) => b.id !== lastBook.id));
      setCurrentAt(at);
      restore(lastBook.draft);
    });
  };
  const removeSaved = (id: number) => {
    const index = saved.findIndex((b) => b.id === id);
    setSaved((list) => list.filter((b) => b.id !== id));
    if (index >= 0 && index < currentAt) setCurrentAt((at) => (at === AT_END ? at : at - 1));
  };
  /** 목록에서 from 번째 줄을 to 번째 자리로 옮김 */
  const moveEntry = (from: number, to: number) => {
    if (from === to || to < 0 || to >= entries.length) return;
    const list = [...entries];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setSaved(list.flatMap((e) => (e.kind === "saved" ? [e.saved] : [])));
    setCurrentAt(list.findIndex((e) => e.kind === "current"));
  };
  const duplicate = !!trimmed && saved.some((b) => b.draft.name === trimmed);

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

  /** 앞면 · 뒷면이 모두 있으면 한 세트로 서버에 등록하고 바로 선택 */
  const registerSet = async () => {
    if (!draft.front || !draft.back || !draftName.trim() || registering) return;
    setBgError(null);
    setRegistering(true);
    try {
      const set = await registerPhotoSet({ label: draftName.trim().slice(0, 12), front: draft.front, back: draft.back, paper: draftPaper });
      setSets((list) => [...list, set]);
      setDraft({ front: null, back: null });
      setDraftName("");
      setCustomOpen(false);
      pickSet(set);
    } catch (e) {
      console.error(e);
      setBgError(e instanceof Error && e.message ? e.message : "서버에 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setRegistering(false);
    }
  };

  const removeSet = async (id: string) => {
    setBgError(null);
    try {
      await deletePhotoSet(id);
      setSets((list) => list.filter((c) => c.id !== id));
      if (picture === id) choosePicture(PICTURES[0].key); // 지운 세트를 쓰고 있었다면 기본 그림으로
    } catch (e) {
      console.error(e);
      setBgError("지우지 못했어요. 잠시 뒤 다시 해 주세요.");
    }
  };

  /** 모든 학생 통장을 PDF 하나로: A4 한 장에 4쪽씩 놓고 자르는 점선을 그림. 학생마다 새 장에서 시작 */
  const savePdf = async () => {
    if (!books.length) return;
    setBusy(true);
    setExportError(null);
    try {
      const [{ jsPDF }, css] = await Promise.all([import("jspdf"), embeddedFontCss(books.map((b) => bankbookText(b.book)).join(""))]);
      const { orientation, page, cols, left, top } = layout;
      const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
      const { w, h } = page;
      // 크게 인쇄할수록 그림을 더 촘촘하게 만듦
      const scale = Math.max(2, (2 * w) / BOOK_MM.w);
      doc.setLineDashPattern([1, 1], 0);
      doc.setLineWidth(0.2);
      doc.setDrawColor(187);
      // 거래 내역 쪽은 모두 같으므로 그림을 한 번만 만들어 다시 씀
      const images = new Map<string, { data: Uint8Array; alias: string }>();
      for (const [si, sheet] of sheetList.entries()) {
        if (si > 0) doc.addPage();
        for (const [slot, p] of sheet.pages.entries()) {
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
      }
      doc.save(books.length === 1 ? `${safeFileName(books[0].name)} 칭찬통장.pdf` : `칭찬통장 ${books.length}명.pdf`);
    } catch (e) {
      console.error(e);
      setExportError("PDF로 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  /** A4 한 장에 놓이는 쪽들 (자르는 점선 포함) */
  const sheetContent = (s: number) =>
    (sheetList[s]?.pages ?? []).map((p, slot) => (
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
    ));

  const last = step === STEPS.length - 1;
  /** 이름을 적어야 이름 단계 다음으로 갈 수 있음 */
  const canNext = step === 0 ? !!pictureArt : step === 1 ? !!trimmed : true;
  const chip = (on: boolean) =>
    `rounded-lg px-2 py-2 text-sm font-semibold ring-1 ring-inset transition ${
      on ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
    }`;

  /** 앞면 · 속지 · 거래 내역 · 뒷면 (거래 내역은 모든 쪽이 같음). 화면과 내 사진 등록 창에서 같이 씀 */
  // 이름 · 통장 정보 단계는 속지만, 거래 내역 단계는 거래 내역만 보여 줌 (등록 창은 모두)
  const onlySlot = customOpen ? null : step === 1 || step === 2 ? "info" : step === 3 ? "ledger-0" : null;
  const slotGrid = (
    <div className={`grid gap-4 ${onlySlot ? "mx-auto max-w-md" : "sm:grid-cols-2"}`}>
              {[
                { key: "cover", label: "앞면", fadeKey: cover },
                { key: "info", label: "속지", fadeKey: previewPaper },
                { key: "ledger-0", label: `거래 내역 (${ledgers}쪽)`, fadeKey: "ledger" },
                { key: "back", label: "뒷면", fadeKey: back },
              ].filter((slot) => !onlySlot || slot.key === onlySlot).map((slot) => (
                <figure key={slot.key} className="rounded-2xl border border-slate-200 bg-slate-100 p-3">
                  <figcaption className="mb-2 text-xs font-semibold text-slate-500">{slot.label}</figcaption>
                  {customOpen && ((slot.key === "cover" && !draft.front) || (slot.key === "back" && !draft.back)) ? (
                    <div
                      className="grid w-full place-items-center rounded-md border border-dashed border-slate-300 bg-white/60 px-3 text-center text-xs text-slate-400"
                      style={{ aspectRatio: `${BOOK_W} / ${BOOK_H}` }}
                    >
                      {slot.label} 사진을 올리면 보여요
                    </div>
                  ) : (
                    <FadePage svg={pages.find((x) => x.key === slot.key)?.svg} fadeKey={slot.fadeKey} label={slot.label} />
                  )}
                </figure>
              ))}
    </div>
  );

  return (
    <div className="fade-up mx-auto max-w-5xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">칭찬통장 만들기</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 overflow-x-clip rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <StepProgress steps={STEPS} step={step} checking={checking} onGo={goStep} />

          <div className={`space-y-5 ${fadeClass}`}>
          {saved.length > 0 && step !== DONE_STEP && (
            // 다음 학생 통장을 만드는 동안 이미 만든 학생을 늘 보여 줌
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-emerald-800">다 만든 통장 {saved.length}개</p>
                <button type="button" onClick={cancelAdd} className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
                  추가 그만하기
                </button>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="다 만든 통장">
                {saved.map((b, i) => (
                  <li key={b.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                    <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    {i + 1}. {b.draft.name}
                  </li>
                ))}
                <li className="rounded-full border border-dashed border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700" aria-current="true">
                  {saved.length + 1}. {trimmed || "지금 만드는 통장"}
                </li>
              </ul>
            </div>
          )}
          <StepHeading step={saved.length > 0 && step < DONE_STEP ? { ...STEPS[step], hint: `${saved.length + 1}번째 학생의 통장이에요.` } : STEPS[step]} />

          {step === 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600" htmlFor="bb-picture">
                기본 배경
              </label>
              <select
                id="bb-picture"
                value={picture}
                onChange={(e) => {
                  const set = sets.find((c) => c.id === e.target.value);
                  if (set) pickSet(set);
                  else choosePicture(e.target.value);
                }}
                className={field}
              >
                {PICTURES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
                {sets.length > 0 && (
                  <optgroup label="내 사진">
                    {sets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {sets.some((c) => c.id === picture) && (
                <button
                  type="button"
                  onClick={() => void removeSet(picture)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  이 내 사진 지우기
                </button>
              )}

              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                disabled={sets.length >= MAX_PHOTO_SETS}
                className={`mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50 ${chip(false)}`}
              >
                내 사진 사용하기
              </button>
              {sets.length >= MAX_PHOTO_SETS && <p className="mt-1.5 text-xs text-slate-400">등록한 배경이 가득 찼어요. 안 쓰는 배경을 지워 주세요.</p>}
              {bgError && (
                <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                  {bgError}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="bb-name">
                이름
              </label>
              <NameCombobox id="bb-name" value={name} onChange={setName} names={savedNames} maxLength={10} placeholder="예: 이순신" className={field} />
              {/* 등록된 학생을 받아 오면 이름 칸에서 쓰는 대로 자동으로 찾아 줌 */}
              <ImportStudentsButton
                className="mt-2"
                onImport={async () => {
                  const list = await onLoadStudents();
                  if (!list) return null;
                  return list.length ? `등록된 학생 ${list.length}명을 불러왔어요. 이름을 쓰면 찾아 줘요.` : "학생 정보 관리에 등록된 학생이 없어요.";
                }}
              />
              {duplicate && <p className="mt-1.5 text-xs font-medium text-amber-700">이미 통장을 만든 학생이에요. 같은 학생 통장을 하나 더 만들어요.</p>}
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
              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">속지 색</span>
                  <PaperPicker value={paper} onChange={setPaper} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
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
          )}

          {step === DONE_STEP && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">내려받을 통장 {books.length}개</p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrag((d) => d && { ...d, over: -1 })}>
                  {entries.map((entry, i) => {
                    const isCurrent = entry.kind === "current";
                    const label = isCurrent ? trimmed : entry.saved.draft.name;
                    // 끌어서 놓을 자리를 위 · 아래 선으로 보여 줌
                    const line =
                      drag && drag.over === i && drag.from !== i && drag.from !== i - 1
                        ? "shadow-[inset_0_2px_0_0_#6366f1]"
                        : drag && drag.over === entries.length && i === entries.length - 1 && drag.from !== i
                          ? "shadow-[inset_0_-2px_0_0_#6366f1]"
                          : "";
                    return (
                      <li
                        key={isCurrent ? "current" : entry.saved.id}
                        draggable={entries.length > 1}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", label);
                          setDrag({ from: i, over: i });
                        }}
                        onDragOver={(e) => {
                          if (!drag) return;
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          const over = e.clientY < r.top + r.height / 2 ? i : i + 1;
                          if (over !== drag.over) setDrag({ ...drag, over });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (drag && drag.over >= 0) moveEntry(drag.from, drag.over > drag.from ? drag.over - 1 : drag.over);
                          setDrag(null);
                        }}
                        onDragEnd={() => setDrag(null)}
                        className={`flex items-center gap-2 bg-white px-2 py-2 text-sm transition-opacity first:rounded-t-xl last:rounded-b-xl ${line} ${
                          drag?.from === i ? "opacity-40" : ""
                        }`}
                      >
                        {entries.length > 1 ? (
                          <button
                            type="button"
                            aria-label={`${label} 순서 바꾸기 (위아래 화살표)`}
                            title="끌어서 순서 바꾸기"
                            onKeyDown={(e) => {
                              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                              e.preventDefault();
                              moveEntry(i, e.key === "ArrowUp" ? i - 1 : i + 1);
                            }}
                            className="grid h-6 w-5 shrink-0 cursor-grab place-items-center rounded text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
                          >
                            <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" fill="currentColor" aria-hidden="true">
                              {[2, 8, 14].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
                            </svg>
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}
                        <span className="w-4 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{label}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {isCurrent ? pictureLabel : entry.saved.pictureLabel} · 거래 {isCurrent ? ledgers : entry.saved.ledgers}쪽
                        </span>
                        {isCurrent ? (
                          <span className="w-6 shrink-0" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeSaved(entry.saved.id)}
                            aria-label={`${label} 통장 빼기`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {entries.length > 1 && <p className="mt-1.5 text-xs text-slate-400">왼쪽 점을 끌어서 순서를 바꿀 수 있어요. 이 순서대로 PDF에 담겨요.</p>}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={addAnother}
                  disabled={!book}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-5 py-3 text-[15px] font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusIcon className="h-5 w-5" />
                  다른 학생 통장 더 만들기
                </button>
                <button
                  type="button"
                  onClick={savePdf}
                  disabled={busy || !book}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {busy ? <Spinner className="h-5 w-5" /> : <DownloadIcon className="h-5 w-5" />}
                  모두 다운로드
                </button>
              </div>
              {exportError && (
                <p role="alert" className="text-center text-xs font-medium text-red-600">
                  {exportError}
                </p>
              )}
            </div>
          )}
          </div>

          <StepNav
            step={step}
            last={last}
            canNext={canNext}
            checking={checking}
            onPrev={() => goStep(step - 1)}
            onNext={() => goNext()}
            invalidMessage={step === 0 ? "표지 그림을 불러오는 중이에요. 잠시만 기다려 주세요." : "이름을 입력해 주세요."}
          />
        </div>

        <section aria-label="칭찬통장 미리보기" className={`min-w-0 space-y-4 ${previewView(fadeFrom) === previewView(fadeTo) ? "" : fadeClass}`}>
          {/* 앞면 · 속지 · 거래 내역 · 뒷면 (거래 내역은 모든 쪽이 같음) */}
          {step === DONE_STEP && (
            <SlideCarousel
              count={sheetList.length}
              render={sheetContent}
              caption={(i) => (sheetList[i] ? `${sheetList[i].name} (${i + 1}/${sheetList.length}장)` : "")}
              aspectRatio={`${layout.paper.w} / ${layout.paper.h}`}
              maxWidth={layout.orientation === "landscape" ? 640 : 452}
            />
          )}

          <div className={step === DONE_STEP ? "hidden" : ""}>{slotGrid}</div>

        </section>
      </div>
      {customOpen && (
        <div role="dialog" aria-modal="true" aria-label="내 사진 사용하기" className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
          <div className="fade-up mx-auto max-w-5xl rounded-2xl bg-slate-50 p-5 shadow-xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">내 사진 사용하기</h2>
              </div>
              <button type="button" onClick={() => setCustomOpen(false)} className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
                닫기
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                    placeholder="배경 이름"
                    aria-label="배경 이름"
                    onChange={(e) => setDraftName(e.target.value)}
                    className={`mt-1.5 ${field}`}
                  />
                  <div className="mt-1.5">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">속지 색</span>
                    <PaperPicker value={draftPaper} onChange={setDraftPaper} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void registerSet()}
                    disabled={!draft.front || !draft.back || !draftName.trim() || registering}
                    aria-busy={registering}
                    className={`relative mt-1.5 flex w-full items-center justify-center overflow-hidden rounded-lg bg-indigo-600 px-2 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed ${
                      registering ? "disabled:bg-indigo-600" : "disabled:bg-slate-200 disabled:text-slate-400"
                    }`}
                  >
                    {registering ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        <span className="sr-only">등록 중</span>
                      </>
                    ) : (
                      "기본 배경으로 등록하기"
                    )}
                  </button>
                </>
              )}
                {bgError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                    {bgError}
                  </p>
                )}
              </div>
              <div className="min-w-0">{slotGrid}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FADE_MS = 250;

/**
 * 쪽 그림을 보여 줌. fadeKey(고른 그림 · 속지 색)가 바뀌면 이전 그림이 서서히 사라진 뒤 새 그림이 서서히 나타나고,
 * 글자를 고치는 것처럼 fadeKey 가 같을 때는 바로 바꿈. 새 그림을 불러오는 동안(svg 없음)은 이전 그림을 그대로 둠.
 * 처음 불러올 때는 회색 칸이 깜빡임.
 */
function FadePage({ svg, fadeKey, label }: { svg: string | undefined; fadeKey: string | undefined; label: string }) {
  const [shown, setShown] = useState<{ svg: string; key: string | undefined } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!svg) return;
    if (!shown) {
      // 처음 나타날 때: 투명한 채로 그린 다음 서서히 보이게 함
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 그림이 바뀔 때 서서히 바꾸는 애니메이션
      setShown({ svg, key: fadeKey });
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    }
    if (shown.key === fadeKey) {
      if (shown.svg !== svg) setShown({ svg, key: fadeKey });
      // 처음 나타날 때 예약한 표시 동작이 다시 실행되며 취소되므로 여기서 보이게 함
      setVisible(true);
      return;
    }
    setVisible(false);
    const t = setTimeout(() => {
      setShown({ svg, key: fadeKey });
      requestAnimationFrame(() => setVisible(true));
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [svg, fadeKey, shown]);

  if (!shown) {
    return (
      <div
        role="status"
        aria-label={`${label} 불러오는 중`}
        className="w-full animate-pulse rounded-md bg-slate-200 shadow-md"
        style={{ aspectRatio: `${BOOK_W} / ${BOOK_H}` }}
      />
    );
  }
  return (
    <div
      className="overflow-hidden rounded-md bg-white shadow-md transition-opacity ease-in-out motion-reduce:transition-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      style={{ opacity: visible ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      // bankbookPages 는 입력값을 XML 이스케이프한 뒤 직접 만든 SVG 문자열
      dangerouslySetInnerHTML={{ __html: shown.svg }}
    />
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

/** 속지 색을 실제 색과 함께 고름 */
function PaperPicker({ value, onChange }: { value: PaperColor; onChange: (c: PaperColor) => void }) {
  return (
    <div role="radiogroup" aria-label="속지 색" className="grid grid-cols-3 gap-1.5">
      {(Object.keys(PAPER_COLORS) as PaperColor[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold ring-1 ring-inset transition ${
            value === c ? "bg-indigo-50 text-indigo-700 ring-indigo-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: PAPER_COLORS[c].fill }} />
          {c}
        </button>
      ))}
    </div>
  );
}
