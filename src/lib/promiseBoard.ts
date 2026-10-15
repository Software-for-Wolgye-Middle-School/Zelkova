/**
 * 나와의 약속판: 달력 계산과 Gemini 이미지 생성 프롬프트.
 * 브라우저(날짜 미리보기)와 서버(API 라우트)에서 함께 사용합니다.
 */

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type PromiseBoardRequest = { name: string; year: number; month: number };

/** 해당 월의 달력: 주마다 일~토 7칸, 날짜가 없는 칸은 null */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** 요청 값 검사. 문제가 있으면 사용자에게 보여줄 메시지를 돌려줌 */
export function parseRequest(body: unknown): PromiseBoardRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  const year = Number(b.year);
  const month = Number(b.month);
  if (!name) return "이름을 입력해 주세요.";
  if (name.length > 12) return "이름은 12자 이하로 입력해 주세요.";
  if (/[<>{}"`\\]/.test(name)) return "이름에 쓸 수 없는 문자가 있어요.";
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return "연도를 확인해 주세요.";
  if (!Number.isInteger(month) || month < 1 || month > 12) return "월을 확인해 주세요.";
  return { name, year, month };
}

export function promiseBoardFileName({ name, year, month }: PromiseBoardRequest, ext = "png") {
  const safe = name.replace(/[\\/:*?"<>|]/g, "");
  return `${safe} 나와의 약속판 (${year}년 ${month}월).${ext}`;
}

/** 올려 둔 약속판 이미지(참고 자료)와 같은 형식으로, 이름과 날짜만 바꿔 그리도록 하는 프롬프트 */
export function buildPrompt({ name, year, month }: PromiseBoardRequest, hasReference: boolean) {
  const weeks = monthWeeks(year, month);
  const grid = weeks
    .map(
      (week, i) =>
        `  Row ${i + 1}: ` + week.map((d, j) => `${WEEKDAYS[j]}=${d === null ? "(empty)" : d}`).join(", "),
    )
    .join("\n");
  const lastDay = new Date(year, month, 0).getDate();

  const style = hasReference
    ? `Recreate the attached reference image "나와의 약속판" as faithfully as possible: the same portrait A4 layout, the same cute pastel kawaii illustration style, the same colors, line weights, fonts, decorations and characters. Only change the parts listed under CHANGES.`
    : `Draw a cute pastel kawaii printable poster for children, portrait A4 layout, white background, soft rounded shapes, dark brown outlines.`;

  return `${style}

FIXED DESIGN (keep exactly):
- Title at the top in big, chunky, rounded, colorful Korean letters: "나와의 약속판" (each syllable a different pastel color: pink, blue, purple, yellow, green, blue, with a thin dark outline).
- Under the title, a pale pink rounded ribbon with small hearts on both ends that says: "작은 약속이 모여, 더 멋진 내가 돼요!"
- Top-left: a white bunny winking and hugging a red heart, with small pink hearts and yellow sparkle lines. Top-right: a cream puppy peeking over the edge, with a yellow speech bubble that says "나는 !! 할 수 있어!".
- A large calendar with rounded outer corners and dark brown grid lines. Header row with seven weekday cells: "일" (pink background, red text), "월", "화", "수" (light pink backgrounds, dark text), "목" (light purple background), "금" (light pink background), "토" (light blue background, blue text).
- In each date cell, the day number is in the top-left corner inside a small pastel circle. Circle colors by column: 일 pink with red number, 월 yellow, 화 green, 수 sky blue, 목 lavender, 금 peach, 토 sky blue with blue number. Cells are otherwise empty white space for writing.
- At the bottom, a rounded cream box with a red heart on the left, two dotted writing lines, a small pink heart, a rainbow with two smiling clouds and yellow sparkles on the right, and the centered text "이 달의 약속 작성 공간".

CHANGES (must be exact):
1. The calendar is for ${year}년 ${month}월. It has exactly ${weeks.length} rows of dates, filled exactly like this (left to right 일 월 화 수 목 금 토; "(empty)" means a blank cell with no number):
${grid}
   Every number from 1 to ${lastDay} appears exactly once. Do not add any other numbers.
2. Between the ribbon and the calendar, add one small line of text in the same cute style: a pastel month badge "${month}월" on the left, and on the right a rounded name tag "이름: ${name}". Spell the name exactly as "${name}".

RULES:
- All Korean text must be spelled exactly as written above. Do not add any other words, watermarks, signatures or English text.
- Keep the whole poster inside the frame with a little white margin, ready to print.`;
}
