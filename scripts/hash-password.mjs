// 학생 정보 관리 로그인 계정을 서버 환경 변수로 만듦.
// 사용: node scripts/hash-password.mjs <아이디> <비밀번호>
// 나온 줄을 .env.local (이 컴퓨터) 이나 배포 서비스의 환경 변수에 넣으면 됨. 비밀번호 원래 글자는 어디에도 저장되지 않음.
import { randomBytes, scryptSync } from "node:crypto";

const [id, password] = process.argv.slice(2);
if (!id || !password) {
  console.error("사용법: node scripts/hash-password.mjs <아이디> <비밀번호>");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password.normalize("NFC"), salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url");

console.log(`ADMIN_ID=${id.normalize("NFC")}`);
console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
