"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeField, type IepFields, type IepPresence } from "@/lib/iep";

/**
 * 개별화교육계획 실시간 동시 편집 (브라우저 쪽).
 *
 * - 고친 칸은 곧바로(0.15초 뒤) 서버로 보내고, 1초마다 서버에 다른 선생님이 바꾼 칸이 있는지 물어봄.
 * - 서버에서 온 값(server)과 화면의 값(local)을 따로 들고 있다가, 아직 보내지 못한 내 글이 있는 칸에 다른 사람의 글이 오면
 *   두 글을 합쳐(merge3) 내 글이 지워지지 않게 함.
 * - 한글을 조합하는 중인 칸에는 다른 사람의 글을 넣지 않고 기다렸다가 조합이 끝나면 넣음 (넣으면 글자 조합이 깨짐).
 */

export type IepStatus = "connecting" | "live" | "saving" | "offline" | "login" | "gone";

export const IEP_STATUS_TEXT: Record<IepStatus, { text: string; tone: string }> = {
  connecting: { text: "서버에 연결하는 중…", tone: "text-slate-400" },
  live: { text: "✓ 실시간 저장 중", tone: "text-emerald-600" },
  saving: { text: "저장 중…", tone: "text-slate-500" },
  offline: { text: "서버에 연결되지 않았어요. 고친 내용은 연결되면 자동으로 저장돼요.", tone: "text-amber-600" },
  login: { text: "로그인이 풀렸어요. 다시 로그인하면 자동으로 저장돼요.", tone: "text-amber-600" },
  gone: { text: "다른 선생님이 이 문서를 지웠어요.", tone: "text-red-600" },
};

const POLL_MS = 1000;
const HIDDEN_POLL_MS = 5000;
const EDIT_DELAY_MS = 150;
const RETRY_MS = [2000, 5000, 10000, 20000];

export type Me = { id: string; name: string; color: string };

export function useIepSync(docId: string, me: Me) {
  const local = useRef<IepFields>({});
  const server = useRef<IepFields>({});
  const pending = useRef(new Set<string>());
  const rev = useRef(0);
  const focused = useRef("");
  const composing = useRef("");
  /** 조합 중이라 미뤄 둔, 다른 사람이 바꾼 값 */
  const deferred = useRef<IepFields>({});
  const [values, setValues] = useState<IepFields>({});
  const [presence, setPresence] = useState<IepPresence[]>([]);
  const [status, setStatus] = useState<IepStatus>("connecting");
  const [loaded, setLoaded] = useState(false);
  const schedule = useRef<(ms: number) => void>(() => {});
  const sendBeacon = useRef<() => void>(() => {});

  /** 서버에서 온 값 하나를 받아들임. base 는 그 값이 바뀌기 전 기준 */
  const accept = useCallback((key: string, base: string, value: string) => {
    const mine = local.current[key];
    if (!pending.current.has(key) || mine === base) {
      local.current[key] = value;
      pending.current.delete(key);
    } else {
      local.current[key] = mergeField(key, base, mine ?? "", value);
      if (local.current[key] === value) pending.current.delete(key);
    }
    server.current[key] = value;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let again = false;
    let failures = 0;

    const body = () => {
      const keys = [...pending.current].filter((k) => k !== composing.current);
      const sent: IepFields = {};
      const changes = keys.map((key) => {
        sent[key] = local.current[key] ?? "";
        return { key, base: server.current[key] ?? "", value: sent[key] };
      });
      return { sent, payload: { id: docId, since: rev.current, me: { ...me, field: focused.current }, changes } };
    };

    async function tick() {
      if (cancelled) return;
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      const { sent, payload } = body();
      let res: Response | null = null;
      try {
        res = await fetch("/api/iep/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      } catch {
        res = null;
      }
      if (cancelled) return;
      busy = false;
      if (res?.status === 404) {
        setStatus("gone");
        return; // 더 묻지 않음
      }
      if (!res || !res.ok) {
        setStatus(res?.status === 401 ? "login" : "offline");
        timer = setTimeout(tick, RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
        return;
      }
      failures = 0;
      const data = (await res.json()) as { rev: number; fields: IepFields; applied: IepFields; presence: IepPresence[] };
      if (cancelled) return;
      const before = { ...local.current };
      // 내가 보낸 칸: 보낼 때의 내 값이 기준. 보내는 사이 더 고쳤으면 서버에서 합쳐진 값 위에 더 고친 것을 얹음
      for (const [key, value] of Object.entries(data.applied)) accept(key, sent[key], value);
      // 다른 사람이 바꾼 칸
      for (const [key, value] of Object.entries(data.fields)) {
        if (key in data.applied || server.current[key] === value) continue;
        if (key === composing.current) deferred.current[key] = value;
        else accept(key, server.current[key] ?? "", value);
      }
      rev.current = Math.max(rev.current, data.rev);
      // 바뀐 것이 있을 때만 다시 그림 (1초마다 모든 칸을 다시 그리지 않도록)
      const keys = Object.keys(local.current);
      if (keys.length !== Object.keys(before).length || keys.some((k) => before[k] !== local.current[k])) setValues({ ...local.current });
      setPresence((old) => (JSON.stringify(old) === JSON.stringify(data.presence) ? old : data.presence));
      setLoaded(true);
      setStatus(pending.current.size ? "saving" : "live");
      const next = again || pending.current.size ? EDIT_DELAY_MS : document.visibilityState === "visible" ? POLL_MS : HIDDEN_POLL_MS;
      again = false;
      clearTimeout(timer);
      timer = setTimeout(tick, next);
    }

    schedule.current = (ms: number) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };
    // 탭을 닫거나 다른 화면으로 나갈 때 아직 못 보낸 글을 마지막으로 보냄
    sendBeacon.current = () => {
      if (!pending.current.size) return;
      const { payload } = body();
      void fetch("/api/iep/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
    };
    void tick();

    const onVisible = () => document.visibilityState === "visible" && schedule.current(0);
    const onHide = () => sendBeacon.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      sendBeacon.current();
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, [docId, me, accept]);

  /** 칸 하나를 고침 */
  const set = useCallback((key: string, value: string) => {
    if (local.current[key] === value) return;
    local.current[key] = value;
    pending.current.add(key);
    setValues({ ...local.current });
    setStatus("saving");
    schedule.current(EDIT_DELAY_MS);
  }, []);

  /** 지금 입력 중인 칸 (다른 선생님 화면에 표시됨) */
  const focus = useCallback((key: string) => {
    if (focused.current === key) return;
    focused.current = key;
    schedule.current(EDIT_DELAY_MS);
  }, []);
  const blur = useCallback((key: string) => {
    if (focused.current !== key) return;
    focused.current = "";
    schedule.current(EDIT_DELAY_MS);
  }, []);

  /** 한글 조합 시작 · 끝 */
  const compose = useCallback((key: string, on: boolean) => {
    if (on) {
      composing.current = key;
      return;
    }
    if (composing.current !== key) return;
    composing.current = "";
    const later = deferred.current[key];
    if (later !== undefined) {
      delete deferred.current[key];
      accept(key, server.current[key] ?? "", later);
      setValues({ ...local.current });
    }
    if (pending.current.has(key)) schedule.current(EDIT_DELAY_MS);
  }, [accept]);

  /** 보내지 못한 글이 남아 있는지 */
  const hasPending = useCallback(() => pending.current.size > 0, []);

  return { values, presence, status, loaded, set, focus, blur, compose, hasPending };
}
