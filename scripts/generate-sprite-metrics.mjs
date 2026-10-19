// Measure actual decoded local pixels, rather than assuming every canvas is 96x96.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('work/regmc/data/pokedex.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { Pokedex } = sandbox.exports;
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const dimensions = Object.fromEntries(Object.entries(Pokedex).filter(([, mon]) => mon.heightm > 0).map(([id, mon]) => [id, { height: mon.heightm, weight: mon.weightkg }]));
// Some source form ids are aliases. Match the exact form name, never another Pokémon.
for (const mon of Object.values(Pokedex)) if(mon.heightm>0) dimensions[normalize(mon.name)] = { height: mon.heightm, weight: mon.weightkg };
const paths = Object.values(JSON.parse(readFileSync('public/sprites/manifest.json')).images);
const { readdirSync } = await import('node:fs');
paths.push(...readdirSync('public/sprites/forms').filter(name => name.endsWith('.png')).map(name => `/sprites/forms/${name}`));
const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5191/');
  const metrics = await page.evaluate(async paths => {
    const result = {};
    for (const path of paths) {
      const response = await fetch(path);
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw Error(`${path}: HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right < 0) throw Error(`${path}: empty image`);
      result[path] = { width: canvas.width, height: canvas.height, x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
      bitmap.close();
    }
    return result;
  }, paths);
  const rosterSandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,rosterSandbox);
  const legendarySandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/legendary-roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,legendarySandbox);
  const signatureSandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/signature-roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,signatureSandbox);
  const expansionSandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/expansion-roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,expansionSandbox);
  const mythicalSandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/mythical-roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,mythicalSandbox);
  const legacySandbox={exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/data/legacy-roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,legacySandbox);
  const used=new Set([...rosterSandbox.exports.roster.map(mon=>mon.id),...legendarySandbox.exports.legendaryRoster.map(mon=>mon.id),...signatureSandbox.exports.signatureRoster.map(mon=>mon.id),...expansionSandbox.exports.expansionRoster.map(mon=>mon.id),...mythicalSandbox.exports.mythicalRoster.map(mon=>mon.id),...legacySandbox.exports.legacyRoster.map(mon=>mon.id),...paths.filter(path=>path.includes('/forms/')).map(path=>path.split('/').at(-1).replace(/-(front|back)\.png$/,''))]);
  const selectedDimensions=Object.fromEntries(Object.entries(dimensions).filter(([id])=>used.has(id)));
  writeFileSync('src/presentation/sprite-metrics.generated.json', JSON.stringify({ source: 'Local PNG alpha bounds; heights/weights: cached Pokémon Showdown Pokedex, see THIRD_PARTY_NOTICES.md', dimensions:selectedDimensions, images: metrics }));
  console.log(JSON.stringify({ decoded: paths.length, measured: Object.keys(metrics).length, empty: 0 }));
} finally { await browser?.close(); await server.close(); }
