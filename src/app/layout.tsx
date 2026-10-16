import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "느티나무 교실 도우미",
  description: "특수학급 시간표(전체 · 학생별), 나와의 약속판, 칭찬통장, 이름표를 손쉽게 만들어 주는 도우미입니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 약속판 · 칭찬통장 · 이름표에 쓰는 둥근 글꼴 (SVG 안에서 'Jua' 이름 그대로 써야 해서 next/font 대신 링크 사용) */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- 루트 레이아웃이라 모든 화면에 적용됨 */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
