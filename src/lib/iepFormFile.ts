import { readForm, type Form } from "@/lib/hwpForm";

/**
 * 학교 개별화교육계획 한글 빈 양식(public/templates/iep-form.hwp)을 읽음 (서버 전용).
 * 서버리스에서도 늘 같은 주소로 받을 수 있게 사이트의 공개 파일에서 받음. 빈 양식(학생 정보 없음)이라 메모리에 잠시 둠.
 */

const FORM_PATH = "/templates/iep-form.hwp";
const memo = globalThis as { __zelkovaIepForm?: { at: number; file: Uint8Array; form: Form } };
const KEEP_MS = 10 * 60 * 1000;

export async function loadIepForm(request: Request): Promise<{ file: Uint8Array; form: Form } | null> {
  const m = memo.__zelkovaIepForm;
  if (m && Date.now() - m.at < KEEP_MS) return m;
  const res = await fetch(new URL(FORM_PATH, request.url), { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const file = new Uint8Array(await res.arrayBuffer());
  const entry = { at: Date.now(), file, form: readForm(file) };
  memo.__zelkovaIepForm = entry;
  return entry;
}
