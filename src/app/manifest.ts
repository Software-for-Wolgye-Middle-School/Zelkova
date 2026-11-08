import type { MetadataRoute } from "next";

/** 휴대폰 · PC 에 앱으로 설치할 때 쓰는 이름과 아이콘 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "느티나무 교실 도우미",
    short_name: "느티나무",
    description: "특수학급 시간표(전체 · 학생별), 나와의 약속판, 칭찬통장, 이름표를 손쉽게 만들어 주는 도우미입니다.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
