/** 앱에 들어 있는 기본 특수학급 시간표 템플릿 (public/templates) */
export const DEFAULT_TEMPLATE_URL = "/templates/special-class-template.docx";

/** 입력 순서: 1) 기본 정보  2) 특수학생 정보 직접 입력  3) 학급 시간표 업로드 (파일 이름은 상관없음) */
export const WIZARD_STEPS = [
  {
    title: "기본 정보",
    heading: "학년도와 선생님을 확인해 주세요",
    description: "시간표 제목과 선생님 칸에 들어갈 내용이에요. 바뀐 것이 없으면 그대로 다음으로 넘어가세요.",
  },
  {
    title: "특수학생 정보",
    heading: "특수학생 정보를 입력해 주세요",
    description: "특수학급에서 수업을 듣는 학생의 학년 · 반 · 이름과 수강 과목을 입력하세요.",
  },
  {
    title: "학급 시간표",
    heading: "학급 시간표를 올려 주세요",
    description: "전체 학급의 주간 시간표가 담긴 엑셀 파일",
  },
] as const;

export const CLASS_FILE = {
  accept: ".xlsx,.xls",
  formats: "Excel (.xlsx)",
  hints: ["A열에 '1 - 1' 형식의 학급 제목", "각 칸은 과목 다음 줄에 선생님 (예: 국어A ↵ 미숙)"],
};

export type SlotState =
  | { status: "empty" }
  | { status: "checking"; file: File }
  | { status: "ready"; file: File; buf: ArrayBuffer; summary: string; details: string[] }
  | { status: "error"; file: File; message: string };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
