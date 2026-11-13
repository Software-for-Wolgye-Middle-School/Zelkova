// 학생 정보 관리 로그인 계정을 서버 환경 변수로 만듦.
// 사용: node scripts/hash-password.mjs <아이디> <비밀번호>
//       node scripts/hash-password.mjs --super <아이디> <비밀번호>   (관리자 계정: SUPER_ADMIN_* 로 나옴)
//       node scripts/hash-password.mjs --teacher <아이디> <비밀번호> (특수교사 계정: TEACHER_* 로 나옴)
//       node scripts/hash-password.mjs --enc-key                    (소통게시판 암호화 키: MESSAGE_ENC_KEY 로 나옴)
// 나온 줄을 .env.local (이 컴퓨터) 이나 배포 서비스의 환경 변수에 넣으면 됨. 비밀번호 원래 글자는 어디에도 저장되지 않음.
import { randomBytes, scryptSync } from "node:crypto";

const args = process.argv.slice(2);
if (args[0] === "--enc-key") {
  console.log(`MESSAGE_ENC_KEY=${randomBytes(32).toString("base64url")}`);
  process.exit(0);
}
const isSuper = args[0] === "--super";
const isTeacher = args[0] === "--teacher";
const [id, password] = isSuper || isTeacher ? args.slice(1) : args;
if (!id || !password) {
  console.error("사용법: node scripts/hash-password.mjs [--super | --teacher] <아이디> <비밀번호>  또는  --enc-key");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password.normalize("NFC"), salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url");

const prefix = isSuper ? "SUPER_ADMIN" : isTeacher ? "TEACHER" : "ADMIN";
console.log(`${prefix}_ID=${id.normalize("NFC")}`);
console.log(`${prefix}_PASSWORD_SALT=${salt}`);
console.log(`${prefix}_PASSWORD_HASH=${hash}`);
if (!isSuper && !isTeacher) console.log(`AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
