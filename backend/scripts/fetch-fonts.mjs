#!/usr/bin/env node
// Supplies the interior/cover fonts listed in assets/fonts/manifest.json.
//   node scripts/fetch-fonts.mjs            download missing "fetched" fonts, verify everything
//   node scripts/fetch-fonts.mjs --verify   verify only; never touches the network
// Every file (font and license) must match its pinned SHA-256. A mismatch is never overwritten silently.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const verifyOnly = process.argv.includes('--verify');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFile(path.join(root, file)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });

async function download(url, expected, file) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${file}: download failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expected) throw new Error(`${file}: downloaded bytes do not match the pinned SHA-256`);
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, target); } finally { await rm(temporary, { force: true }); }
}

let failures = 0;
const missing = [];
for (const font of manifest.fonts) {
  for (const [file, expected, url] of [[font.file, font.sha256, font.url], [font.licenseFile, font.licenseSha256, font.licenseUrl]]) {
    const bytes = await read(file);
    if (bytes && sha256(bytes) === expected) continue;
    if (bytes) { console.error(`MISMATCH ${file}: remove it and rerun to restore the pinned file`); failures++; continue; }
    if (font.delivery === 'vendored') { console.error(`MISSING vendored file ${file}`); failures++; continue; }
    if (verifyOnly) { missing.push(file); continue; }
    try { await download(url, expected, file); console.log(`fetched ${file}`); } catch (error) { console.error(String(error.message ?? error)); failures++; }
  }
}
if (missing.length) console.warn(`Optional fonts not installed (${missing.length} files). Run "pnpm --filter backend fonts:fetch". Affected languages report reduced support.`);
if (failures) { console.error(`${failures} font file(s) failed verification.`); process.exit(1); }
console.log(`Font manifest verified (${manifest.fonts.length} files).`);
