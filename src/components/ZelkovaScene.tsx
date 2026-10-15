/**
 * 메인 화면 배경: 햇빛이 비추고 바람이 불어 가운데 느티나무가 천천히 흔들리는 장면.
 * 모든 움직임은 globals.css 의 .scene-* 애니메이션이며, 움직임 줄이기 설정에서는 멈춥니다.
 */

// 느티나무 수관: 뒤(짙은 잎) → 가운데 → 앞(햇빛 받는 잎) 순서로 겹쳐 그림 [cx, cy, r]
const CROWN_BACK: [number, number, number][] = [
  [520, 470, 70], [600, 400, 90], [700, 330, 100], [800, 370, 95], [900, 450, 80], [960, 520, 55],
  [470, 530, 55], [640, 480, 90], [800, 480, 90], [720, 430, 110], [880, 330, 60], [560, 330, 55],
];
const CROWN_MID: [number, number, number][] = [
  [540, 430, 60], [620, 350, 75], [720, 290, 80], [820, 320, 75], [890, 400, 70], [590, 470, 60],
  [700, 400, 85], [840, 450, 65], [500, 500, 45], [940, 480, 50], [770, 250, 50], [660, 260, 50],
];
const CROWN_FRONT: [number, number, number][] = [
  [560, 390, 45], [640, 310, 55], [720, 255, 50], [600, 440, 40], [680, 360, 45], [790, 285, 40],
  [520, 470, 30], [850, 360, 32],
];
const SPECKLES: [number, number, number][] = [
  [600, 300, 14], [660, 255, 12], [700, 220, 16], [560, 350, 12], [520, 420, 10], [760, 225, 11],
  [630, 380, 9], [740, 300, 10], [500, 470, 9], [820, 270, 9],
];
const BRANCHES: [string, number][] = [
  ["M708 600 C680 560 640 520 590 490", 16],
  ["M712 585 C700 530 690 470 670 420", 14],
  ["M720 575 C722 510 725 450 728 380", 15],
  ["M728 585 C745 530 765 480 790 430", 14],
  ["M732 600 C765 565 805 530 860 505", 16],
  ["M590 490 C565 475 545 470 520 470", 6],
  ["M670 420 C655 395 640 380 615 370", 6],
  ["M790 430 C810 405 830 390 855 382", 6],
  ["M860 505 C885 495 905 490 930 492", 6],
  ["M728 380 C730 350 735 330 742 310", 6],
];
const LEAVES = [
  { x: 820, y: 360, delay: 0, dur: 11 },
  { x: 900, y: 430, delay: 3.5, dur: 13 },
  { x: 760, y: 300, delay: 6, dur: 12 },
  { x: 960, y: 500, delay: 8.5, dur: 10 },
  { x: 680, y: 420, delay: 10, dur: 14 },
];
const WIND = [
  { d: "M-80 330 C 180 300, 360 360, 620 320 S 1040 290, 1520 330", delay: 0, dur: 9 },
  { d: "M-80 520 C 220 490, 420 550, 700 515 S 1100 480, 1520 520", delay: 3, dur: 10 },
  { d: "M-80 200 C 260 180, 480 230, 760 200 S 1180 170, 1520 205", delay: 6, dur: 11 },
];
const GRASS = Array.from({ length: 46 }, (_, i) => {
  const x = 20 + i * 31 + ((i * 37) % 13);
  const h = 22 + ((i * 53) % 20);
  const y = 840 + ((i * 29) % 40);
  return { x, y, h, delay: -((i * 0.37) % 3) };
});

export default function ZelkovaScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="햇빛 아래 바람에 천천히 흔들리는 느티나무"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9dcf2" />
          <stop offset="0.55" stopColor="#e3f0f1" />
          <stop offset="1" stopColor="#fbf0d2" />
        </linearGradient>
        <radialGradient id="sun-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7d6" stopOpacity="1" />
          <stop offset="0.35" stopColor="#fff1bf" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff1bf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sun-core" cx="0.45" cy="0.42" r="0.6">
          <stop offset="0" stopColor="#fffbe9" />
          <stop offset="1" stopColor="#ffe27a" />
        </radialGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff4c8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8cc068" />
          <stop offset="1" stopColor="#5a9443" />
        </linearGradient>
        <linearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5a41" />
          <stop offset="0.45" stopColor="#5e4331" />
          <stop offset="1" stopColor="#4a3426" />
        </linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* 하늘 */}
      <rect width="1440" height="900" fill="url(#sky)" />

      {/* 해와 햇살 */}
      <g className="scene-sun-glow">
        <circle cx="230" cy="170" r="300" fill="url(#sun-glow)" />
      </g>
      <g className="scene-sun-rays" opacity="0.5">
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d="M230 170 L222 -40 L238 -40 Z"
            fill="#fff3c2"
            transform={`rotate(${i * 30} 230 170)`}
          />
        ))}
      </g>
      <circle cx="230" cy="170" r="62" fill="url(#sun-core)" />

      {/* 구름 */}
      <g className="scene-cloud" style={{ animationDuration: "160s", animationDelay: "-40s" }} opacity="0.85">
        <ellipse cx="0" cy="120" rx="90" ry="26" fill="#fff" />
        <ellipse cx="50" cy="105" rx="60" ry="28" fill="#fff" />
        <ellipse cx="-40" cy="110" rx="45" ry="20" fill="#fff" />
      </g>
      <g className="scene-cloud" style={{ animationDuration: "210s", animationDelay: "-150s" }} opacity="0.7">
        <ellipse cx="0" cy="240" rx="120" ry="24" fill="#fff" />
        <ellipse cx="60" cy="225" rx="70" ry="26" fill="#fff" />
      </g>

      {/* 빛줄기 */}
      <g className="scene-beams" style={{ mixBlendMode: "screen" }}>
        <polygon points="230,170 1180,900 960,900" fill="url(#beam)" />
        <polygon points="230,170 760,900 600,900" fill="url(#beam)" opacity="0.7" />
        <polygon points="230,170 1440,700 1440,860" fill="url(#beam)" opacity="0.6" />
      </g>

      {/* 먼 언덕 */}
      <path d="M0 690 C 240 630 420 660 640 640 S 1100 600 1440 660 L1440 900 L0 900 Z" fill="#cfe4c1" />
      <path d="M0 740 C 300 700 520 730 760 715 S 1200 690 1440 720 L1440 900 L0 900 Z" fill="#acd18f" />
      <path d="M0 790 C 320 760 560 785 820 772 S 1240 760 1440 780 L1440 900 L0 900 Z" fill="url(#ground)" />

      {/* 나무 그늘과 햇빛 반점 */}
      <ellipse cx="735" cy="800" rx="270" ry="28" fill="#2f5a2a" opacity="0.22" filter="url(#soft)" />
      <g className="scene-flecks" filter="url(#soft)">
        <ellipse cx="650" cy="799" rx="22" ry="4" fill="#f6ffd0" />
        <ellipse cx="770" cy="804" rx="18" ry="3.5" fill="#f6ffd0" />
        <ellipse cx="840" cy="797" rx="14" ry="3" fill="#f6ffd0" />
      </g>

      {/* 느티나무: 제목과 겹치지 않도록 밑동을 기준으로 조금 줄여서 그림 */}
      <g transform="translate(722 790) scale(0.8) translate(-722 -790)">
      {/* 느티나무 줄기 */}
      <path
        d="M690 790 C700 735 704 690 706 640 C707 610 705 590 702 570 L738 570 C735 590 733 610 734 640 C736 690 744 735 756 790 Z"
        fill="url(#trunk)"
      />
      <path d="M690 790 C672 792 660 796 648 800 L700 800 Z" fill="#4a3426" />
      <path d="M756 790 C774 792 790 796 804 800 L748 800 Z" fill="#4a3426" />

      {/* 가지와 수관: 줄기 아래쪽을 축으로 함께 흔들림 */}
      <g className="scene-sway scene-sway-branches">
        {BRANCHES.map(([d, w], i) => (
          <path key={i} d={d} stroke="#5b4030" strokeWidth={w} strokeLinecap="round" fill="none" />
        ))}
      </g>
      <g className="scene-sway scene-sway-back">
        {CROWN_BACK.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#3e7136" />
        ))}
      </g>
      <g className="scene-sway scene-sway-mid">
        {CROWN_MID.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#5c9343" />
        ))}
      </g>
      <g className="scene-sway scene-sway-front">
        {CROWN_FRONT.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#86b95a" />
        ))}
        {SPECKLES.map(([cx, cy, r], i) => (
          <circle key={i} className="scene-shimmer" cx={cx} cy={cy} r={r} fill="#c4e38a" style={{ animationDelay: `${-i * 0.7}s` }} />
        ))}
      </g>
      </g>

      {/* 바람결 */}
      {WIND.map((w, i) => (
        <path
          key={i}
          d={w.d}
          className="scene-wind"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}
        />
      ))}

      {/* 바람에 날리는 잎 */}
      {LEAVES.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y})`}>
          <path
            className="scene-leaf"
            d="M0 -7 C6 -4 6 4 0 8 C-6 4 -6 -4 0 -7 Z"
            fill={i % 2 ? "#7fb553" : "#a3c95f"}
            style={{ animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s` }}
          />
        </g>
      ))}

      {/* 풀 */}
      <g>
        {GRASS.map((g, i) => (
          <path
            key={i}
            className="scene-grass"
            d={`M${g.x} ${g.y} q 3 ${-g.h / 2} ${i % 2 ? 6 : -4} ${-g.h}`}
            stroke={i % 3 ? "#4f8a3a" : "#6aa64a"}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            style={{ animationDelay: `${g.delay}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
