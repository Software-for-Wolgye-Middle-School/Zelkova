import {
  inspectClassTimetables,
  inspectStudents,
  inspectTemplate,
  type FileCheck,
} from "@/lib/timetable";

export type UploadStepDef = {
  title: string;
  description: string;
  kind: "word" | "excel";
  accept: string;
  formats: string;
  hints: string[];
  inspect: (buf: ArrayBuffer) => Promise<FileCheck & { title?: string }> | FileCheck;
};

/** 업로드 순서는 고정입니다. 파일 이름은 상관없이 이 순서대로 받습니다. */
export const UPLOAD_STEPS: UploadStepDef[] = [
  {
    title: "특수학급 시간표",
    description: "선생님 구분과 색상이 들어간 빈 특수학급 시간표 워드 파일",
    kind: "word",
    accept: ".docx",
    formats: "Word (.docx)",
    hints: ["'월 화 수 목 금' 머리행이 있는 표", "왼쪽 열에 1교시 ~ 7교시"],
    inspect: inspectTemplate,
  },
  {
    title: "특수학생 정보",
    description: "특수학생의 학년 · 반 · 이름 · 수강 과목이 정리된 엑셀 파일",
    kind: "excel",
    accept: ".xlsx,.xls,.csv",
    formats: "Excel (.xlsx)",
    hints: ["첫 행 머리글: 학년 | 반 | 이름 | 수강 과목", "수강 과목은 쉼표로 구분 (예: 국어, 영어, 수학)"],
    inspect: inspectStudents,
  },
  {
    title: "학급 시간표",
    description: "전체 학급의 주간 시간표가 담긴 엑셀 파일",
    kind: "excel",
    accept: ".xlsx,.xls",
    formats: "Excel (.xlsx)",
    hints: ["A열에 '1 - 1' 형식의 학급 제목", "각 칸은 과목 다음 줄에 선생님 (예: 국어A ↵ 미숙)"],
    inspect: inspectClassTimetables,
  },
];

export type SlotState =
  | { status: "empty" }
  | { status: "checking"; file: File }
  | { status: "ready"; file: File; buf: ArrayBuffer; check: FileCheck & { title?: string } }
  | { status: "error"; file: File; message: string };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
