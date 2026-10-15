import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "느티나무 교실 도우미",
  description: "특수학급 시간표(전체 · 학생별)와 나와의 약속판을 손쉽게 만들어 주는 도우미입니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
