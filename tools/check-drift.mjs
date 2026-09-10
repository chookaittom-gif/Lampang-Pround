/**
 * Deployment drift guard for the local/deployed-compatible TypeScript source.
 *
 * This repository does not contain the legacy GAS Code/ mirror used by the
 * dirty primary checkout, so the gate checks contracts that are actually
 * present here: Drive adapter parity and production deployment invariants.
 * A mismatch is a hard failure; this is intentionally not a no-op.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(process.env.LP_DRIFT_ROOT || defaultRoot);
const normalize = (value) => String(value).replace(/\r\n/g, '\n');

let hardFails = 0;

function filePath(relativePath) {
  return resolve(root, relativePath);
}

function read(relativePath) {
  const absolutePath = filePath(relativePath);
  if (!existsSync(absolutePath)) {
    hardFails++;
    console.error(`[drift] HARD-FAIL missing file: ${relativePath}`);
    return '';
  }
  return normalize(readFileSync(absolutePath, 'utf8'));
}

function pass(name) {
  console.log(`[drift] OK ${name}`);
}

function fail(name, detail) {
  hardFails++;
  console.error(`[drift] HARD-FAIL ${name}: ${detail}`);
}

function section(source, header) {
  const start = source.indexOf(`${header}\n`);
  if (start < 0) return '';
  const bodyStart = start + header.length + 1;
  const nextHeader = source.slice(bodyStart).search(/\n(?=\[)/);
  return nextHeader < 0
    ? source.slice(bodyStart)
    : source.slice(bodyStart, bodyStart + nextHeader);
}

function assignment(source, key, expected) {
  const escaped = String(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${key}\\s*=\\s*"${escaped}"\\s*$`, 'm').test(source);
}

function booleanAssignment(source, key, expected) {
  return new RegExp(`^\\s*${key}\\s*=\\s*${expected}\\s*$`, 'm').test(source);
}

const config = read('worker/wrangler.toml');
const productionVars = section(config, '[env.production.vars]');
const productionD1 = section(config, '[[env.production.d1_databases]]');
const assetsSection = section(config, '[assets]');

if (booleanAssignment(assetsSection, 'run_worker_first', 'true')) {
  pass('static assets run through Worker');
} else {
  fail('static assets run through Worker', 'assets.run_worker_first must be true');
}

const productionAssignments = [
  ['production IMAGE_STORAGE', 'IMAGE_STORAGE', 'drive'],
  ['production PDF_NATIVE', 'PDF_NATIVE', 'on'],
];
for (const [name, key, expected] of productionAssignments) {
  if (assignment(productionVars, key, expected)) pass(name);
  else fail(name, `expected ${key} = "${expected}"`);
}

if (/^\s*GAS_DRIVE_ADAPTER_URL\s*=\s*"https:\/\//m.test(productionVars)) {
  pass('production Drive adapter URL');
} else {
  fail('production Drive adapter URL', 'GAS_DRIVE_ADAPTER_URL must use HTTPS');
}

if (/^\s*database_name\s*=\s*"lampang-pround"\s*$/m.test(productionD1) &&
    /^\s*database_id\s*=\s*"(?!TODO)[^"]+"\s*$/m.test(productionD1)) {
  pass('production D1 binding');
} else {
  fail('production D1 binding', 'database name/id is missing or still a TODO placeholder');
}

if (!/\[\[env\.production\.r2_buckets\]\]/.test(config)) {
  pass('production intentionally has no R2 image binding');
} else {
  fail('production intentionally has no R2 image binding', 'R2 binding conflicts with Drive-only production policy');
}

if (/type\s*=\s*"Data"\s*,\s*globs\s*=\s*\["\*\*\/\*\.ttf"\]\s*,\s*fallthrough\s*=\s*false/.test(config)) {
  pass('TTF module rule explicitly terminates');
} else {
  fail('TTF module rule explicitly terminates', 'the **/*.ttf rule must set fallthrough = false');
}

const workerAdapter = read('worker/src/lib/drive-adapter.ts');
const workerImages = read('worker/src/lib/images.ts');
const gasAdapter = read('gas/drive-adapter/Code.gs');
const adapterFields = [
  ['driveFileId', /data\.driveFileId|driveFileId\s*:/],
  ['driveUrl', /driveUrl\s*:/],
  ['thumbnailUrl', /thumbnailUrl\s*:/],
  ['mimeType', /data\.mimeType|mimeType\s*:/],
  ['fileSize', /data\.fileSize|fileSize\s*:/],
];
for (const [field, pattern] of adapterFields) {
  if (!pattern.test(workerAdapter) || !new RegExp(`${field}\\s*:`).test(gasAdapter)) {
    fail(`Drive adapter field ${field}`, 'Worker and GAS adapter contracts have drifted');
  } else {
    pass(`Drive adapter field ${field}`);
  }
}

for (const mime of ['image/jpeg', 'image/png', 'image/gif']) {
  const quotedMime = `'${mime}'`;
  if (!workerAdapter.includes(quotedMime) && !workerImages.includes(quotedMime)) {
    fail(`image MIME ${mime}`, 'Worker allowlist is missing this MIME type');
  } else if (!gasAdapter.includes(`'${mime}'`)) {
    fail(`image MIME ${mime}`, 'GAS adapter sniffing is missing this MIME type');
  } else {
    pass(`image MIME ${mime}`);
  }
}

if (workerImages.includes('8 * 1024 * 1024') && gasAdapter.includes('8 * 1024 * 1024')) {
  pass('8 MB image size limit');
} else {
  fail('8 MB image size limit', 'Worker and GAS adapter limits have drifted');
}

console.log(`[drift] ${hardFails} hard-fail`);
process.exitCode = hardFails > 0 ? 1 : 0;
