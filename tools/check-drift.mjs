/**
 * Drift guard (Q2+Q7) — กันคนแก้ไฟล์ GAS ต้นฉบับตอน freeze หลุดเข้า deploy
 * hard-fail: javascript.html ↔ app.js.txt / index.html ↔ frontend/index.html
 * soft-warn: Code.gs, style.html (เทียบ hash กับ baseline)
 *
 * วิธีใช้: node tools/check-drift.mjs            (รันจาก repo root)
 *          node tools/check-drift.mjs --init     (สร้าง baseline ใหม่หลัง re-port ที่ตั้งใจ)
 * ผูกกับ deploy อัตโนมัติใน worker/package.json อยู่แล้ว
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const normEol = (s) => s.replace(/\r\n/g, '\n');

const APP_NAME = 'ระบบฐานข้อมูล Lampang Pround';
const ORG_NAME = 'สำนักงานพัฒนาชุมชน';

let hardFails = 0;
let softWarns = 0;

function hardFail(name, detail) {
  hardFails++;
  console.error(`[drift] HARD-FAIL ${name}: ${detail}`);
}

function softWarn(name, detail) {
  softWarns++;
  console.log(`[drift] warn ${name}: ${detail}`);
}

function pass(name) {
  console.log(`[drift] OK ${name}`);
}

function checkPair1() {
  const name = 'javascript.html ↔ app.js.txt';
  const gas = read('Code/javascript.html');
  const start = gas.indexOf('<script>');
  const end = gas.lastIndexOf('</script>');
  if (start < 0 || end < 0 || end <= start) {
    hardFail(name, 'หา <script> wrapper ใน Code/javascript.html ไม่พบ');
    return;
  }
  const body = normEol(gas.slice(start + '<script>'.length, end)).trim();
  const ported = normEol(read('frontend/src/legacy/app.js.txt')).trim();
  const outside = normEol(gas.slice(0, start) + gas.slice(end + '</script>'.length)).trim();
  if (outside !== '') {
    hardFail(name, 'พบเนื้อหานอก <script> block ใน Code/javascript.html (freeze violation)');
    return;
  }
  if (body !== ported) {
    hardFail(name, 'เนื้อหาไม่ตรงกัน — มีคนแก้ฝั่งใดฝั่งหนึ่งหลัง port (รัน codemod ใหม่หรือ rollback การแก้)');
    return;
  }
  pass(name);
}

function checkPair2() {
  const name = 'index.html ↔ frontend/index.html';
  let gas = normEol(read('Code/index.html'));
  const ported = normEol(read('frontend/index.html'));
  gas = gas
    .replace(/<\?= appName \?>/g, APP_NAME)
    .replace(/<\?= orgName \?>/g, ORG_NAME)
    .replace(
      /<script src="https:\/\/unpkg\.com\/lucide[^"]*"><\/script>/g,
      '<script src="/lucide.min.js"></script>'
    )
    .replace(/<\?!= include\('[^']*'\); \?>\n?/g, '');
  const cutAt = (s) => {
    const i = s.indexOf('</footer>');
    return i < 0 ? s : s.slice(0, i + '</footer>'.length);
  };
  // เปรียบเทียบระดับโครงสร้าง: trim + ตัดบรรทัดว่าง (port ตัดบรรทัด include ทิ้ง
  // ทำให้ indent/บรรทัดว่างต่างกันได้ แต่เนื้อหา DOM ต้องตรงทุกบรรทัด)
  const skeleton = (s) =>
    cutAt(s)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n');
  if (skeleton(gas) !== skeleton(ported)) {
    hardFail(name, 'โครง DOM ไม่ตรงกัน — มีคนแก้ Code/index.html หลัง freeze');
    return;
  }
  pass(name);
}

function checkBaseline() {
  const baselinePath = resolve(ROOT, 'tools/drift-baseline.json');
  const targets = ['Code/Code.gs', 'Code/style.html'];
  const current = Object.fromEntries(targets.map((p) => [p, sha256(read(p))]));
  if (process.argv.includes('--init')) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
    console.log('[drift] baseline written');
    return;
  }
  if (!existsSync(baselinePath)) {
    softWarn('baseline', 'ยังไม่มี tools/drift-baseline.json — รันด้วย --init ครั้งแรก');
    return;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  for (const p of targets) {
    if (baseline[p] && baseline[p] !== current[p]) {
      softWarn(p, 'ไฟล์ถูกแก้หลัง baseline (soft-warn: ถ้าตั้งใจต้อง re-port + --init ใหม่)');
    } else {
      pass(`${p} (baseline)`);
    }
  }
}

checkPair1();
checkPair2();
checkBaseline();

console.log(`[drift] ${hardFails} hard-fail, ${softWarns} warn`);
process.exit(hardFails > 0 ? 1 : 0);
