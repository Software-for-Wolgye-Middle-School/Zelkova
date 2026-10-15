# 느티나무 교실 도우미

특수학급 시간표(전체 · 학생별)와 나와의 약속판을 만드는 Next.js 앱입니다.

## 특수학급 시간표

`timetable.py`를 Next.js 웹 앱으로 옮긴 것입니다. 모든 처리는 브라우저 안에서 이루어지며 파일은 서버로 전송되지 않습니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

배포용: `npm run build && npm start`

## 사용 순서 (파일 이름은 상관없음)

1. 특수학생 정보 — 화면에서 직접 입력 (학년 · 반 · 이름 · 수강 과목). 입력한 내용은 브라우저에 자동 저장됩니다.
2. 학급 시간표 (.xlsx) — A열 "1 - 1" 제목, 그 아래 1교시~7교시

특수학급 시간표 양식은 `public/templates/special-class-template.docx` 를 기본으로 사용합니다.
양식을 바꾸려면 이 파일을 같은 이름의 새 .docx 파일로 교체하세요.

`시간표 생성하기` → 미리보기 확인 → 다운로드

## 만들어지는 파일

- 전체 특수학급 시간표 — 각 칸에 `[과목]` 과 학생 이름
- 학생별 시간표 — 같은 양식에 그 학생이 특수학급에서 수업하는 칸만 과목명으로 채움
  (예: `강동아 특수학급 시간표 (2026년 1학기).docx`)
- `모두 다운로드 (ZIP)` — 전체 시간표 + `학생별 시간표/` 폴더

## 구조

- `src/lib/timetable.ts` — 엑셀 읽기, 시간표 계산, 워드 템플릿 채우기 (`timetable.py`와 같은 결과)
- `src/components/` — 업로드 단계, 생성 중 화면, 결과 미리보기

## 나와의 약속판

메인 화면의 `나와의 약속판 만들기` → 이름과 연 · 월 선택 → 미리보기 확인 → `그림 파일로 저장 (PNG)` 또는 `인쇄 · PDF로 저장`.

- 앱이 약속판을 SVG로 직접 그립니다 (`src/lib/promiseBoardSvg.ts`). 무료이고, 날짜와 이름이 항상 정확합니다.
- 글꼴은 Google Fonts 의 Jua 를 쓰며, 저장할 때 약속판에 쓰인 글자만 담은 글꼴을 그림 안에 넣습니다.

### (선택) Gemini AI 그림

미리보기 아래 `Gemini AI 그림으로 만들기` 는 서버(`src/app/api/promise-board/route.ts`)가 Gemini 이미지 모델로 그림을 받아옵니다.
Gemini 이미지 모델은 무료 등급에서 쓸 수 없으므로 결제(유료 등급)를 연결한 API 키가 필요합니다. 이름과 날짜가 Gemini 로 전송됩니다.

1. `.env.example` 을 `.env.local` 로 복사하고 `GEMINI_API_KEY` 를 넣은 뒤 서버를 다시 시작합니다. (`.env.example` 에는 키를 넣지 마세요)
2. 형식을 맞출 참고 이미지를 `public/templates/promise-board-reference.png` (또는 .jpg/.webp) 로 저장합니다.
