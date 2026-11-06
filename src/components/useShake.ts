"use client";

import { useRef, useState } from "react";

const SHAKE_MS = 450;

/**
 * 잘못 눌렀을 때 버튼을 흔들기. shakeClass 를 버튼에 붙이고 shake() 를 부르면 한 번 흔들림
 * (휴대폰에서는 짧게 진동도). 흔들리는 중에 또 부르면 처음부터 다시 흔들림
 */
export function useShake() {
  const [shaking, setShaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shake = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(80);
    if (timer.current) clearTimeout(timer.current);
    setShaking(false);
    // 클래스를 뗐다가 다음 그림에서 다시 붙여야 애니메이션이 처음부터 다시 돎
    requestAnimationFrame(() => {
      setShaking(true);
      timer.current = setTimeout(() => setShaking(false), SHAKE_MS);
    });
  };

  return { shake, shakeClass: shaking ? "shake" : "" };
}
