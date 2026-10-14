import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {selectTeamPreview} from './browser-preview.mjs';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executablePath) throw Error('Chrome 또는 Edge가 필요합니다.');
mkdirSync('work', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true }, logLevel: 'error' });
const report = { passed: false, errors: [], imageErrors: [], layouts: [], checks: [] };
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/sprites/') && !response.ok()) report.imageErrors.push(response.url()); });
  await page.addInitScript(() => { Date.now = () => 123456789; });
  const origin = 'http://127.0.0.1:5186';
  async function setup(format, lead = 'charizard') {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(async lead => {
      const { createSet, TEAM_STORAGE_KEY } = await import('/src/team/index.ts');
      const first = { ...createSet(lead), itemId: 'none' };
      if (lead === 'charizard') first.moves = ['flamethrower', 'airslash', 'roost', 'protect'];
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify({ version: 1, team: [first, createSet('blastoise'), createSet('raichu')] }));
      localStorage.setItem('arena-reduced-motion', 'false');
      localStorage.setItem('arena-sound', 'true');
    }, lead);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: format === 'singles' ? '싱글 배틀 시작' : '더블 배틀', exact: true }).click();
    await selectTeamPreview(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.scene-actor .pokemon-sprite')].every(image => image.complete && image.naturalWidth > 0));
  }
  async function choose(name) {
    await page.getByRole('button', { name: '싸운다', exact: true }).click();
    await page.locator('.move-actions').getByRole('button', { name }).click();
  }
  async function settled() { await page.waitForFunction(() => document.querySelector('.battle-scene')?.getAttribute('aria-busy') === 'false', null, { timeout: 45000 }); }

  await setup('singles');
  await page.waitForTimeout(250); // Let the short UI entrance transition finish before the capture.
  await page.screenshot({ path: 'work/polish-single.png' });
  await page.getByLabel('배틀 재생 속도').selectOption('1.5');
  await choose(/^화염방사/);
  await page.getByRole('button', { name: /행동 결정/ }).click();
  await page.waitForFunction(() => document.querySelector('.battle-scene')?.dataset.eventKind === 'damage' && document.querySelector('.plate-player')?.dataset.actualHp !== document.querySelector('.plate-player [role="meter"]')?.getAttribute('aria-valuenow'), null, { timeout: 30000 });
  const hpFrame = await page.locator('.plate-player').evaluate(node => ({ actual: Number(node.dataset.actualHp), shown: Number(node.querySelector('[role="meter"]').getAttribute('aria-valuenow')), number: Number(node.querySelector('.plate-hp-text strong').textContent) }));
  assert(hpFrame.shown > hpFrame.actual); assert.equal(hpFrame.shown, hpFrame.number);
  assert((await page.locator('.stadium-move-callout').innerText()).includes('다이')); // CPU powered move persists through damage.
  report.checks.push({ hpFrame, namedMovePersistsThroughDamage: true });
  await page.waitForFunction(() => document.querySelector('.battle-scene')?.dataset.eventKind === 'faint', null, { timeout: 10000 });
  assert.equal(await page.locator('.formation-player .actor-fainted').count(), 0);
  await page.screenshot({ path: 'work/polish-faint.png' });
  await settled();
  assert.equal(await page.locator('.battle-action-box').getAttribute('data-menu'), 'party');
  assert.match(await page.locator('.battle-message-box').innerText(), /다음으로 출전/);
  await page.screenshot({ path: 'work/polish-replacement.png' });
  const turn = await page.locator('.scene-mode').innerText();
  await page.locator('.party-actions').getByRole('button', { name: /라이츄/ }).click();
  await page.getByRole('button', { name: /행동 결정/ }).click(); await settled();
  assert.equal(await page.locator('.scene-mode').innerText(), turn);
  assert.equal(await page.locator('.formation-player [data-species="raichu"]').count(), 1);
  report.checks.push('Knockout → chosen replacement; no attack or turn consumed');
  await page.getByLabel('배틀 재생 속도').selectOption('0.75');
  await choose(/^10만볼트/); await page.getByRole('button', { name: /행동 결정/ }).click();
  await page.getByRole('button', { name: '연출 건너뛰기', exact: true }).click(); await settled();
  await page.waitForFunction(() => !document.querySelector('.battle-vfx') && !document.querySelector('.battle-scene')?.dataset.moveId);
  assert.equal(await page.locator('.plate-player').getAttribute('data-actual-hp'), await page.locator('.plate-player [role="meter"]').getAttribute('aria-valuenow'));
  report.checks.push('Skip commits the calculated result and removes temporary effects');

  await setup('doubles');
  await choose(/^화염방사/);
  assert.equal(await page.locator('.actor-target-button').count(), 2);
  await page.getByRole('button', { name: '갸라도스에게 기술 사용', exact: true }).click();
  await choose(/^방어/);
  await page.getByRole('button', { name: /행동 결정/ }).click();
  await page.getByRole('button', { name: '연출 건너뛰기', exact: true }).click(); await settled();
  report.checks.push('Both doubles actions and direct sprite target selection');
  await page.screenshot({ path: 'work/polish-double.png' });

  for (const format of ['singles', 'doubles']) for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    await page.setViewportSize(viewport); await setup(format, 'blastoise');
    await page.getByRole('button', { name: '싸운다', exact: true }).click();
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const panels = [...document.querySelectorAll('.battle-status-plate,.battle-action-box,.battle-message-box')].map(node => ({ className:node.className, rect:node.getBoundingClientRect() }));
      const occlusions = [];
      for(const image of document.querySelectorAll('.scene-actor .pokemon-sprite')) {
        const canvas=document.createElement('canvas'); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>32){minX=Math.min(minX,x);maxX=Math.max(maxX,x+1);minY=Math.min(minY,y);maxY=Math.max(maxY,y+1);}
        const r=image.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height),offsetX=(r.width-canvas.width*scale)/2,offsetY=(r.height-canvas.height*scale)/2;
        const sprite={left:r.left+offsetX+minX*scale,right:r.left+offsetX+maxX*scale,top:r.top+offsetY+minY*scale,bottom:r.top+offsetY+maxY*scale};
        for(const panel of panels){const width=Math.min(sprite.right,panel.rect.right)-Math.max(sprite.left,panel.rect.left),height=Math.min(sprite.bottom,panel.rect.bottom)-Math.max(sprite.top,panel.rect.top);if(width>1&&height>1)occlusions.push({species:image.closest('.scene-actor').dataset.species,panel:panel.className,width,height});}
      }
      return { overflow: document.documentElement.scrollWidth - innerWidth, deck: rect('.battle-action-box'), message: rect('.battle-message-box'), moveCount: document.querySelectorAll('.move-actions [data-type]').length, spriteCount: document.querySelectorAll('.scene-actor .pokemon-sprite').length, occlusions };
    });
    assert(layout.overflow <= 1); assert.equal(layout.moveCount, 4); assert.equal(layout.spriteCount, format === 'singles' ? 2 : 4);
    assert(layout.deck.bottom <= viewport.height); assert(layout.deck.top >= 0);
    assert.deepEqual(layout.occlusions, [], `Sprite obscured at ${format} ${viewport.width}×${viewport.height}`);
    if (viewport.width <= 680) assert(layout.message.bottom <= layout.deck.top);
    report.layouts.push({ format, ...viewport, ...layout });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `work/polish-${format}-${viewport.width}.png` });
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.imageErrors, []);
  report.passed = true;
  console.log('BROWSER_POLISH_OK ' + JSON.stringify(report));
} catch (error) {
  report.error = String(error); await pageScreenshot(); throw error;
} finally {
  writeFileSync('work/polish-browser-report.json', JSON.stringify(report, null, 2));
  await browser?.close(); await server.close();
}
async function pageScreenshot() { for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.screenshot({ path: 'work/polish-failure.png' }).catch(() => {}); }
