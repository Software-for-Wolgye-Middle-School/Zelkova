import type { ComponentType, SVGProps } from "react";
import { CalendarIcon, ClipboardCheckIcon, PencilIcon, TagIcon, UsersIcon, UtensilsIcon, WalletIcon } from "./icons";

/**
 * 메인 화면의 도구 목록. 새 도구는 TOOLS 에 한 줄 더하면 그 탭에 카드가 생김
 * (도구 화면을 여는 동작은 TimetableApp 의 openTool 에서 id 로 정함)
 */

/** 메인 화면 위쪽 탭: 누구를 위한 도구인지 */
export type ToolCategory = "general" | "assistant" | "teacher";

export const CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: "general", label: "일반 업무" },
  { id: "assistant", label: "특수학급 실무사" },
  { id: "teacher", label: "특수학급 교사" },
];

export type ToolId = "timetable" | "promise" | "bankbook" | "nametag" | "meal" | "handwriting" | "students";

export type Tool = {
  id: ToolId;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  category: ToolCategory;
  /** 아이콘 칸의 색 (Tailwind 클래스) */
  tone: string;
};

export const TOOLS: Tool[] = [
  { id: "timetable", title: "특수학급 시간표 만들기", icon: CalendarIcon, category: "general", tone: "bg-green-100 text-green-700" },
  { id: "promise", title: "나와의 약속판 만들기", icon: ClipboardCheckIcon, category: "general", tone: "bg-lime-100 text-lime-700" },
  { id: "bankbook", title: "칭찬통장 만들기", icon: WalletIcon, category: "general", tone: "bg-amber-100 text-amber-700" },
  { id: "nametag", title: "이름표 만들기", icon: TagIcon, category: "general", tone: "bg-emerald-100 text-emerald-700" },
  { id: "meal", title: "급식표 조회하기", icon: UtensilsIcon, category: "general", tone: "bg-orange-100 text-orange-700" },
  { id: "handwriting", title: "긍정 · 감성 필사 교실", icon: PencilIcon, category: "general", tone: "bg-teal-100 text-teal-700" },
  { id: "students", title: "학생 정보 관리하기", icon: UsersIcon, category: "general", tone: "bg-stone-200 text-stone-700" },
];
