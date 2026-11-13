import type { ComponentType, SVGProps } from "react";
import { BookCheckIcon, CalendarIcon, ChatIcon, FileTextIcon, ClipboardCheckIcon, PencilIcon, TagIcon, UsersIcon, UtensilsIcon, WalletIcon } from "./icons";

/**
 * 메인 화면의 도구 목록. 새 도구는 TOOLS 에 한 줄 더하면 그 탭에 카드가 생김
 * (도구 화면을 여는 동작은 TimetableApp 의 openTool 에서 id 로 정함)
 */

/** 메인 화면 위쪽 탭: 누구를 위한 도구인지 */
export type ToolCategory = "general" | "admin";

/** locked: 로그인해야 열 수 있는 탭 */
export const CATEGORIES: { id: ToolCategory; label: string; locked: boolean }[] = [
  { id: "general", label: "일반 업무", locked: false },
  { id: "admin", label: "행정 업무", locked: true },
];

export type ToolId = "timetable" | "promise" | "bankbook" | "nametag" | "meal" | "handwriting" | "students" | "dutylog" | "guide" | "iep";

export type Tool = {
  id: ToolId;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  category: ToolCategory;
  /** 아이콘 칸의 색 (Tailwind 클래스) */
  tone: string;
  /** 마우스를 가까이 댔을 때 카드에 번지는 빛의 색 (HSL 색상각) */
  hue: number;
  /** 탭 맨 위에 넓은 대표 카드로 보여 줌 */
  featured?: boolean;
  /** 열 때 로그인해야 함 (잠긴 탭의 도구는 따로 적지 않아도 로그인 필요) */
  login?: boolean;
};

export const TOOLS: Tool[] = [
  { id: "timetable", title: "특수학급 시간표 만들기", icon: CalendarIcon, category: "general", tone: "bg-white/15 text-white", hue: 245, featured: true },
  { id: "promise", title: "나와의 약속판 만들기", icon: ClipboardCheckIcon, category: "general", tone: "bg-pink-100 text-pink-600", hue: 330 },
  { id: "bankbook", title: "칭찬통장 만들기", icon: WalletIcon, category: "general", tone: "bg-amber-100 text-amber-600", hue: 38 },
  { id: "nametag", title: "이름표 만들기", icon: TagIcon, category: "general", tone: "bg-emerald-100 text-emerald-700", hue: 155 },
  { id: "meal", title: "급식표 조회하기", icon: UtensilsIcon, category: "general", tone: "bg-sky-100 text-sky-700", hue: 200 },
  { id: "handwriting", title: "긍정 · 감성 필사 교실", icon: PencilIcon, category: "general", tone: "bg-rose-100 text-rose-600", hue: 350 },
  { id: "students", title: "학생 정보 관리하기", icon: UsersIcon, category: "general", tone: "bg-violet-100 text-violet-700", hue: 262, login: true },
  { id: "dutylog", title: "특수교육실무사 활동일지", icon: BookCheckIcon, category: "admin", tone: "bg-teal-100 text-teal-700", hue: 175 },
  { id: "iep", title: "개별화교육계획 함께 쓰기", icon: FileTextIcon, category: "admin", tone: "bg-indigo-100 text-indigo-700", hue: 235 },
  { id: "guide", title: "사회복무요원 업무 안내", icon: ChatIcon, category: "admin", tone: "bg-sky-100 text-sky-700", hue: 210 },
];

/** 로그인해야 쓸 수 있는 도구인지 (카드에 자물쇠 표시) */
export const needsLogin = (t: Tool) => !!t.login || !!CATEGORIES.find((c) => c.id === t.category)?.locked;
