# 특수학급 시간표 생성기

`timetable.py`를 Next.js 웹 앱으로 옮긴 것입니다. 모든 처리는 브라우저 안에서 이루어지며 파일은 서버로 전송되지 않습니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

배포용: `npm run build && npm start`

## 사용 순서 (파일 이름은 상관없음)

1. 특수학급 시간표 템플릿 (.docx)
2. 특수학생 정보 (.xlsx) — 머리글: 학년 | 반 | 이름 | 수강 과목
3. 학급 시간표 (.xlsx) — A열 "1 - 1" 제목, 그 아래 1교시~7교시

`시간표 생성하기` → 미리보기 확인 → `워드 파일 다운로드`

## 구조

- `src/lib/timetable.ts` — 엑셀 읽기, 시간표 계산, 워드 템플릿 채우기 (`timetable.py`와 같은 결과)
- `src/components/` — 업로드 단계, 생성 중 화면, 결과 미리보기
