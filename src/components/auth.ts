/** 학생 정보 관리 로그인 (브라우저 쪽). 아이디 · 비밀번호 확인은 서버(/api/auth)에서만 함 */

export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok && ((await res.json()) as { authed?: boolean }).authed === true;
  } catch {
    return false;
  }
}

/** 로그인. 실패하면 화면에 보여 줄 문구 */
export async function login(id: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "로그인하지 못했어요. 잠시 뒤 다시 해 주세요." };
  } catch {
    return { ok: false, error: "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." };
  }
}

export async function logout() {
  await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
}
