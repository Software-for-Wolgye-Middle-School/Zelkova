/**
 * 씨앗 → 새싹 → 어린 나무 → 느티나무로 자라는 그림 (움직임은 Landing 의 GSAP 타임라인이 맡음).
 * 처음 그려지는 모습은 흙 위의 씨앗뿐: 나머지는 투명하거나(opacity 0) 선이 안 그려진 상태(dashoffset 1)로 시작.
 * 줄기 · 가지는 pathLength=1 이라 dashoffset 1.01 → 0 으로 끝까지 자람.
 * (간격을 2 로 넓게 두고 1 보다 조금 더 밀어 두어야 둥근 선 끝이 점으로 남지 않음)
 */

const BARK = "#7b4f2c";
const STEM = "#6aa84f";
const LEAF = "#7cc05a";

/** 원점에서 오른쪽으로 뻗은 잎 하나 (잎자루가 원점) */
const LEAF_PATH = "M0 0 C10 -11 28 -12 40 0 C28 12 10 11 0 0 Z";
/** 떡잎: 둥글고 통통한 잎 */
const COTYLEDON_PATH = "M0 0 C6 -15 27 -17 35 -4 C27 8 8 8 0 0 Z";

/** 어린 나무의 잎 [x, y, 각도, 크기] */
const YOUNG_LEAVES: [number, number, number, number][] = [
  [300, 405, -25, 0.85],
  [300, 389, -155, 0.85],
  [300, 371, -30, 0.8],
  [300, 354, -150, 0.8],
  [300, 340, -40, 0.65],
  [300, 336, -140, 0.65],
];

/** 짧은 줄기 끝에서 부채꼴(V자)로 넓게 퍼지는 느티나무 가지 */
const BRANCHES = [
  "M300 396 C270 362 228 322 168 292",
  "M300 396 C284 348 260 300 234 242",
  "M300 396 C302 342 300 292 300 222",
  "M300 396 C316 348 340 300 366 242",
  "M300 396 C330 362 372 322 432 292",
];
const TWIGS = [
  "M168 292 C150 282 134 272 118 262",
  "M200 308 C192 290 186 276 182 258",
  "M234 242 C224 224 214 208 204 192",
  "M300 222 C300 204 302 188 306 170",
  "M366 242 C376 224 386 208 396 192",
  "M400 308 C408 290 414 276 418 258",
  "M432 292 C450 282 466 272 482 262",
];

/** 수관: 뒤(짙은 잎) → 가운데 → 앞(햇빛 받는 잎) [cx, cy, r] */
const CROWN_BACK: [number, number, number][] = [
  [150, 282, 50], [204, 222, 62], [268, 180, 70], [334, 180, 70], [398, 222, 62], [452, 282, 50],
  [228, 292, 58], [372, 292, 58], [300, 252, 76],
];
const CROWN_MID: [number, number, number][] = [
  [180, 258, 45], [240, 202, 52], [300, 166, 55], [360, 202, 52], [420, 258, 45], [300, 232, 60],
  [250, 262, 48], [350, 262, 48],
];
const CROWN_FRONT: [number, number, number][] = [
  [214, 216, 32], [278, 166, 34], [340, 190, 30], [260, 238, 28], [396, 240, 26], [176, 272, 24], [324, 246, 24],
];
const SPECKLES: [number, number, number][] = [
  [262, 158, 9], [300, 150, 7], [230, 196, 8], [212, 236, 6], [340, 172, 7], [282, 210, 6], [190, 262, 6], [370, 218, 6],
];

const stroke = (width: number, color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: width,
  strokeLinecap: "round" as const,
  pathLength: 1,
  strokeDasharray: "1 2",
  strokeDashoffset: 1.01,
});

export default function GrowingTree({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="80 90 440 410" className={className} role="img" aria-label="씨앗이 자라 느티나무가 되는 그림">
      {/* 땅 */}
      <ellipse className="gt-shadow" cx="300" cy="488" rx="150" ry="10" fill="#5c7a3a" opacity="0" />
      <ellipse cx="300" cy="490" rx="118" ry="13" fill="#a87a50" />
      <ellipse cx="300" cy="486" rx="96" ry="8" fill="#bf9166" />
      <g stroke="#7fb24f" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M206 488 l-4 -10 M210 488 l2 -11 M384 487 l-3 -9 M389 487 l3 -10 M248 483 l-2 -7 M352 483 l2 -7" />
      </g>

      {/* 1. 씨앗: 두 쪽으로 갈라짐 */}
      <g className="gt-seed">
        <path className="gt-seed-l" d="M300 458 C291 459 287 468 290 476 C292 481 297 483 300 483 Z" fill="#9a6233" />
        <path className="gt-seed-r" d="M300 458 C309 459 313 468 310 476 C308 481 303 483 300 483 Z" fill="#8a5428" />
        <ellipse cx="296" cy="466" rx="2.5" ry="4" fill="#c08a55" opacity="0.8" />
      </g>

      {/* 2~3. 새싹 줄기 · 떡잎 · 어린 잎 */}
      <path className="gt-stem" d="M300 484 C301 430 299 380 300 330" {...stroke(6, STEM)} />
      <g className="gt-cotyledons">
        <g transform="translate(300 424) rotate(-20)">
          <path className="gt-cotyledon" d={COTYLEDON_PATH} fill="#94cf63" opacity="0" />
        </g>
        <g transform="translate(300 424) rotate(-160) scale(1 -1)">
          <path className="gt-cotyledon" d={COTYLEDON_PATH} fill="#94cf63" opacity="0" />
        </g>
      </g>
      <g className="gt-young">
        {YOUNG_LEAVES.map(([x, y, a, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
            <path className="gt-young-leaf" d={LEAF_PATH} fill={LEAF} opacity="0" />
          </g>
        ))}
      </g>

      {/* 4. 굵어진 줄기와 부채꼴로 퍼지는 가지 */}
      <path className="gt-roots" d="M258 490 C280 484 288 472 290 448 L310 448 C312 472 320 484 342 490 Z" fill={BARK} opacity="0" />
      <path className="gt-trunk" d="M300 488 C297 456 297 426 300 392" {...stroke(30, BARK)} />
      <path className="gt-trunk" d="M307 480 C305 456 305 430 307 402" {...stroke(4, "#946238")} />
      <g className="gt-sway">
        {BRANCHES.map((d) => (
          <path key={d} className="gt-branch" d={d} {...stroke(13, BARK)} />
        ))}
        {TWIGS.map((d) => (
          <path key={d} className="gt-twig" d={d} {...stroke(5, BARK)} />
        ))}

        {/* 5. 둥글고 풍성한 수관 */}
        <g className="gt-crown-back">
          {CROWN_BACK.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} className="gt-blob" cx={cx} cy={cy} r={r} fill="#3f7a3a" opacity="0" />
          ))}
        </g>
        <g className="gt-crown-mid">
          {CROWN_MID.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} className="gt-blob" cx={cx} cy={cy} r={r} fill="#5a9a46" opacity="0" />
          ))}
        </g>
        <g className="gt-crown-front">
          {CROWN_FRONT.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} className="gt-blob" cx={cx} cy={cy} r={r} fill="#86bf5a" opacity="0" />
          ))}
          {SPECKLES.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} className="gt-speckle" cx={cx} cy={cy} r={r} fill="#c4e48f" opacity="0" />
          ))}
        </g>
      </g>
    </svg>
  );
}
