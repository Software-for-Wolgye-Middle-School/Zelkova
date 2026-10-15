import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "특수학급 시간표 생성기",
  description: "특수학급 시간표 템플릿, 특수학생 정보, 학급 시간표를 올리면 특수학급 시간표를 자동으로 만들어 줍니다.",
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
