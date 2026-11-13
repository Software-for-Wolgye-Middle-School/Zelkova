/**
 * Gemini 에 학생 실명을 보내지 않기 위한 가명 처리 (서버 전용).
 * 보내기 전에 학생 이름(성까지 쓴 이름 · 이름만 쓴 것 모두)을 "학생A" 같은 이름표로 바꾸고,
 * 받은 답의 이름표는 서버에서 다시 이름으로 되돌려 화면에 보여 줌. 이름표와 이름의 대응은 요청 하나 동안 메모리에만 있음.
 * 전화번호 · 주민등록번호 모양의 글자도 지워서 보냄.
 */

const JOSA = /(이는|이가|이도|이랑|이를|이의|이와|이한테|이에게|은|는|이|가|도|를|의)$/;
const HANGUL_NAME = /^[가-힣]{2,4}$/;

type Person = { variants: Set<string>; label: string };

/** 학생 소개 줄 맨 앞의 "1-3 초현이는 …" 에서 이름(초현)을 꺼냄 */
function namesFromIntro(intro: string): string[] {
  const out: string[] = [];
  for (const line of intro.split(/\r?\n/)) {
    const m = /^\s*[-•*]?\s*\d\s*[-–]\s*\d{1,2}\s*(?:반\s*)?([가-힣]{2,7})/.exec(line);
    if (!m) continue;
    let name = m[1];
    if (name.length > 2) name = name.replace(JOSA, "");
    if (HANGUL_NAME.test(name)) out.push(name);
  }
  return out;
}

/** 성을 뺀 이름 (세 글자 이름만: 김종인 → 종인) */
const givenName = (full: string) => (full.length === 3 ? full.slice(1) : null);

const tokenFor = (i: number) => `학생${i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26))}`;

export type Pseudonymizer = { hide: (text: string) => string; reveal: (text: string) => string };

/** 등록된 학생 이름과 학생 소개 속 이름으로 가명 처리기를 만듦 */
export function makePseudonymizer(registeredNames: string[], intro: string): Pseudonymizer {
  const people: Person[] = [];
  const find = (name: string) => people.find((p) => p.variants.has(name));
  const add = (name: string, label: string) => {
    const given = givenName(name);
    const existing = find(name) ?? (given ? find(given) : undefined);
    if (existing) {
      existing.variants.add(name);
      if (given) existing.variants.add(given);
      return;
    }
    const variants = new Set([name]);
    if (given) variants.add(given);
    people.push({ variants, label });
  };
  // 학생 소개에 쓴 부르는 이름(시은)을 먼저: 답에서 되돌릴 때 그 이름으로 보이게
  for (const n of namesFromIntro(intro)) add(n, n);
  for (const n of registeredNames.map((s) => s.trim()).filter((s) => HANGUL_NAME.test(s))) add(n, n);

  const pairs = people
    .flatMap((p, i) => [...p.variants].map((v) => [v, tokenFor(i)] as const))
    .sort((a, b) => b[0].length - a[0].length);
  const labels = new Map(people.map((p, i) => [tokenFor(i), p.label]));

  return {
    hide(text) {
      let s = text
        .replace(/\d{6}\s*-\s*[1-4]\d{6}/g, "[주민등록번호]")
        .replace(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, "[전화번호]");
      for (const [name, token] of pairs) s = s.split(name).join(token);
      return s;
    },
    reveal(text) {
      // 이름표 뒤 조사를 이름 받침에 맞춤 (학생A는 → 시은이는, 학생E는 → 김종인은)
      // Gemini 가 이름표를 굵게(**…**) 해 두었으면 먼저 벗김 (아래에서 항상 같은 모양으로 굵게 함)
      const plain = text.replace(/\*\*((?:\d\s*-\s*\d{1,2}\s*(?:반\s*)?)?학생[A-Z]{1,2})\*\*/g, "$1");
      // 이름(앞에 "1-3" 같은 학년-반이 있으면 함께)은 항상 굵게. 이름표 뒤 조사는 이름 받침에 맞춤 (학생A는 → **1-1 시은이**는)
      return plain.replace(/((?:\d\s*-\s*\d{1,2}\s*(?:반\s*)?)?)학생([A-Z]{1,2})(?![A-Za-z])(이(?=이랑|은|는|가|를|을|와|과|랑|도|의|한테|에게))?(이랑|은|는|이|가|을|를|과|와|랑)?/g, (m, cls: string, code: string, _i, josa?: string) => {
        const label = labels.get(`학생${code}`);
        if (!label) return m;
        const batchim = (label.charCodeAt(label.length - 1) - 0xac00) % 28 !== 0;
        // 받침 있는 두 글자 이름은 "시은이"처럼 불러 받침 없는 말로 봄
        const base = batchim && label.length === 2 && josa ? `${label}이` : label;
        const b = batchim && base === label;
        const bold = `**${cls}${base}**`;
        if (!josa) return bold;
        const pick: Record<string, [string, string]> = { 은: ["은", "는"], 는: ["은", "는"], 이: ["이", "가"], 가: ["이", "가"], 을: ["을", "를"], 를: ["을", "를"], 과: ["과", "와"], 와: ["과", "와"], 이랑: ["이랑", "랑"], 랑: ["이랑", "랑"] };
        return bold + pick[josa][b ? 0 : 1];
      });
    },
  };
}
