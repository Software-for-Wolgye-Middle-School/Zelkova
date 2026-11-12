"use client";

import { useEffect, useRef, useState } from "react";
import { hasEntries, weekLog, type DutyLog } from "@/lib/dutyLogSvg";
import type { DutyEvent } from "@/lib/dutyEvents";
import {
  editStamp,
  fetchServer,
  loadLocal,
  loadLocalEvents,
  pushEvent,
  pushServer,
  saveLocal,
  saveLocalEvents,
  type DutyDocs,
  type EventDocs,
} from "./dutyLogSync";

/** 서버 저장 상태 */
export type Status = "checking" | "saving" | "saved" | "offline" | "login";

export const STATUS_TEXT: Record<Status, { text: string; tone: string }> = {
  checking: { text: "서버와 맞춰 보는 중…", tone: "text-slate-400" },
  saving: { text: "저장 중…", tone: "text-slate-500" },
  saved: { text: "✓ 서버에 저장됐어요", tone: "text-emerald-600" },
  offline: { text: "서버에 연결되지 않아 이 컴퓨터에 먼저 저장했어요. 연결되면 자동으로 서버에 저장돼요.", tone: "text-amber-600" },
  login: { text: "로그인이 풀려 이 컴퓨터에 먼저 저장했어요. 다시 로그인하면 자동으로 서버에 저장돼요.", tone: "text-amber-600" },
};

const RETRY_MS = [3000, 8000, 20000, 60000];

/**
 * 활동일지(주별)와 달력 일정의 저장을 맡음: 고칠 때마다 먼저 이 브라우저에 저장하고 곧이어 서버에 저장.
 * 서버가 꺼져 있어도 내용은 브라우저에 남고, 서버가 돌아올 때까지 다시 시도해 올림 (자세한 규칙은 dutyLogSync.ts).
 */
export function useDutySync() {
  const [initial] = useState(() => ({ weeks: loadLocal(), events: loadLocalEvents() }));
  const weeksRef = useRef<DutyDocs>(initial.weeks);
  const eventsRef = useRef<EventDocs>(initial.events);
  const [weeks, setWeeks] = useState<DutyDocs>(initial.weeks);
  const [events, setEvents] = useState<EventDocs>(initial.events);
  const [status, setStatus] = useState<Status>("checking");
  /** 서버에 저장을 예약 (debounce 없이 바로 하려면 0) */
  const scheduleRef = useRef<(ms: number) => void>(() => {});
  /** 기다리지 않고 지금 서버에 저장하고, 올리지 못한 내용이 하나도 없으면 true */
  const flushNowRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sending = false;
    let failures = 0;

    /** 아직 서버에 올리지 못한 주들 · 일정들 */
    const unsyncedWeeks = () => Object.keys(weeksRef.current).filter((k) => !weeksRef.current[k].synced);
    const unsyncedEvents = () => Object.keys(eventsRef.current).filter((k) => !eventsRef.current[k].synced);
    const pending = () => unsyncedWeeks().length + unsyncedEvents().length;
    const setWeekDoc = (key: string, doc: DutyDocs[string]) => {
      weeksRef.current = { ...weeksRef.current, [key]: doc };
      setWeeks(weeksRef.current);
    };
    const setEventDoc = (id: string, doc: EventDocs[string]) => {
      eventsRef.current = { ...eventsRef.current, [id]: doc };
      setEvents(eventsRef.current);
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), ms);
    };
    async function flush() {
      if (cancelled || sending) return; // 보내는 중에 또 고친 내용은 아래 끝에서 이어서 보냄
      sending = true;
      let failed: "auth" | "fail" | null = null;
      for (const key of unsyncedWeeks()) {
        const snap = weeksRef.current[key];
        const result = await pushServer(key, { log: snap.log, updatedAt: snap.updatedAt });
        if (cancelled) return;
        if (result.kind === "ok") {
          // 보내는 사이에 또 고쳤다면 그 내용은 다음 저장에서 올라감
          if (weeksRef.current[key]?.updatedAt === snap.updatedAt) setWeekDoc(key, { ...snap, synced: true });
        } else if (result.kind === "stale") {
          // 다른 곳에서 더 나중에 고친 내용이 서버에 있음
          if (result.doc.updatedAt >= (weeksRef.current[key]?.updatedAt ?? 0)) setWeekDoc(key, { ...result.doc, synced: true });
        } else {
          failed = result.kind;
          break;
        }
      }
      if (!failed) {
        for (const id of unsyncedEvents()) {
          const snap = eventsRef.current[id];
          const result = await pushEvent(id, { event: snap.event, updatedAt: snap.updatedAt });
          if (cancelled) return;
          if (result.kind === "ok") {
            if (eventsRef.current[id]?.updatedAt === snap.updatedAt) setEventDoc(id, { ...snap, synced: true });
          } else if (result.kind === "stale") {
            if (result.doc.updatedAt >= (eventsRef.current[id]?.updatedAt ?? 0)) setEventDoc(id, { ...result.doc, synced: true });
          } else {
            failed = result.kind;
            break;
          }
        }
      }
      sending = false;
      saveLocal(weeksRef.current);
      saveLocalEvents(eventsRef.current);
      if (failed) {
        setStatus(failed === "auth" ? "login" : "offline");
        schedule(RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]); // 서버가 돌아올 때까지 계속 다시 시도
        return;
      }
      failures = 0;
      if (pending()) schedule(0);
      else setStatus("saved");
    }
    scheduleRef.current = schedule;
    flushNowRef.current = async () => {
      clearTimeout(timer);
      for (let i = 0; sending && i < 100; i++) await new Promise((r) => setTimeout(r, 100)); // 보내는 중이면 끝나길 기다림
      await flush();
      return !cancelled && pending() === 0;
    };

    (async () => {
      const server = await fetchServer();
      if (cancelled) return;
      if (server.kind !== "ok") {
        setStatus(server.kind === "auth" ? "login" : "offline");
        if (pending()) schedule(RETRY_MS[0]);
        return;
      }
      for (const [key, doc] of Object.entries(server.weeks)) {
        const local = weeksRef.current[key];
        if (!local || doc.updatedAt > local.updatedAt) setWeekDoc(key, { ...doc, synced: true });
      }
      for (const [id, doc] of Object.entries(server.events)) {
        const local = eventsRef.current[id];
        if (!local || doc.updatedAt > local.updatedAt) setEventDoc(id, { ...doc, synced: true });
      }
      // 서버에 없는 주 · 일정(서버가 비었거나 처음 저장하는 것)은 이 컴퓨터의 내용을 올림
      for (const [key, doc] of Object.entries(weeksRef.current)) {
        if (!server.weeks[key] && hasEntries(doc.log)) setWeekDoc(key, { ...doc, synced: false });
      }
      for (const [id, doc] of Object.entries(eventsRef.current)) {
        if (!server.events[id] && doc.event) setEventDoc(id, { ...doc, synced: false });
      }
      saveLocal(weeksRef.current);
      saveLocalEvents(eventsRef.current);
      if (pending()) schedule(0);
      else setStatus("saved");
    })();

    // 연결이 돌아오거나 탭으로 돌아왔을 때 바로 다시 시도, 탭을 닫는 중에도 올리지 못한 내용은 마지막으로 보냄
    const retryNow = () => {
      if (pending()) schedule(0);
    };
    const onHide = () => {
      for (const key of unsyncedWeeks()) {
        const d = weeksRef.current[key];
        void pushServer(key, { log: d.log, updatedAt: d.updatedAt }, true);
      }
      for (const id of unsyncedEvents()) {
        const d = eventsRef.current[id];
        void pushEvent(id, { event: d.event, updatedAt: d.updatedAt }, true);
      }
    };
    const onVisible = () => document.visibilityState === "visible" && retryNow();
    window.addEventListener("online", retryNow);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisible);
      onHide(); // 다른 화면으로 나갈 때도 올리지 못한 내용은 보냄
    };
  }, []);

  /** 그 주의 활동일지를 고침 (아직 쓴 적 없는 주는 빈 양식에서 시작) */
  const editWeek = (key: string, change: (l: DutyLog) => DutyLog) => {
    const next = change(weeksRef.current[key]?.log ?? weekLog(key));
    weeksRef.current = { ...weeksRef.current, [key]: { log: next, updatedAt: editStamp(), synced: false } };
    saveLocal(weeksRef.current);
    setWeeks(weeksRef.current);
    setStatus("saving");
    scheduleRef.current(500);
  };

  /** 일정을 새로 저장하거나 고침 */
  const saveEvent = (event: DutyEvent) => {
    eventsRef.current = { ...eventsRef.current, [event.id]: { event, updatedAt: editStamp(), synced: false } };
    saveLocalEvents(eventsRef.current);
    setEvents(eventsRef.current);
    setStatus("saving");
    scheduleRef.current(200);
  };

  /** 일정을 지움 (다른 컴퓨터에 남은 같은 일정이 되살아나지 않도록 지웠다는 표시를 남김) */
  const removeEvent = (id: string) => {
    eventsRef.current = { ...eventsRef.current, [id]: { event: null, updatedAt: editStamp(), synced: false } };
    saveLocalEvents(eventsRef.current);
    setEvents(eventsRef.current);
    setStatus("saving");
    scheduleRef.current(200);
  };

  /** 지금 서버에 저장 (저장 단계의 단추) */
  const saveNow = () => flushNowRef.current();

  return { weeks, events, status, editWeek, saveEvent, removeEvent, saveNow };
}
