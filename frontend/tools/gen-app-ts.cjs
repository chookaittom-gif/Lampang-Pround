// One-shot codemod: สร้าง src/legacy/app.ts จาก app.js.txt (verbatim) + window bindings
// รันด้วย: node tools/gen-app-ts.cjs  (จากโฟลเดอร์ frontend/)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'legacy', 'app.js.txt');
const out = path.join(__dirname, '..', 'src', 'legacy', 'app.ts');
const body = fs.readFileSync(src, 'utf8');

const names = new Set();
const re = /^[ ]{0,6}function ([A-Za-z_$][\w$]*)\s*\(/gm;
let m;
while ((m = re.exec(body)) !== null) names.add(m[1]);

const alreadyWin = new Set();
const wre = /^[ ]{0,6}window\.([A-Za-z_$][\w$]*)\s*=/gm;
while ((m = wre.exec(body)) !== null) alreadyWin.add(m[1]);

const toBind = [...names].filter((n) => !alreadyWin.has(n));

const header = `/**
 * Port ตรงจาก Code/javascript.html (5,641 บรรทัด) — ห้ามแก้ logic ในไฟล์นี้
 * นอกจากบล็อก window bindings ท้ายไฟล์ (เพิ่มโดย migration)
 * สถานะ TS: verbatim port ภายใต้ @ts-nocheck — แผนยกระดับ type ทีละโมดูล (ดู README)
 */
// @ts-nocheck
`;

const bindings = `
// ---- Global bindings (แทน global scope เดิมของ <script> คลาสสิก: inline onclick อ้าง global) ----
export const __legacyGlobals = {
  ${toBind.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(',\n  ')}
};
export function installLegacyGlobals() {
  for (const [name, value] of Object.entries(__legacyGlobals)) {
    if (typeof value === 'function') (window as any)[name] = value;
  }
}
`;

fs.writeFileSync(out, header + '\n' + body + '\n' + bindings);
console.log('app.ts written. functions:', names.size);
console.log('already on window in app.js:', [...alreadyWin].join(', ') || '(none)');
console.log('bound count:', toBind.length);
console.log('sample:', toBind.slice(0, 20).join(', '));
