import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';

const browserPaths = process.platform === 'win32'
  ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const browserPath = process.env.CHROME_PATH || browserPaths.find(existsSync);
if (!browserPath) throw new Error('Chrome/Chromium 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정하세요.');
mkdirSync('work', { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /전략을 세우고/ }).waitFor();
  await page.screenshot({ path: 'work/home.png', fullPage: true });

  await page.getByRole('button', { name: '팀 편성', exact: true }).click();
  await page.getByRole('heading', { name: '팀 편성' }).waitFor();
  await page.getByRole('button', { name: /포켓몬 변경/ }).click();
  await page.getByRole('dialog', { name: '포켓몬 선택' }).getByRole('button', { name: /쥬피썬더/ }).click();
  await page.getByRole('heading', { name: '쥬피썬더' }).waitFor();
  await page.getByRole('button', { name: '팀 저장' }).click();
  await page.getByText('팀을 브라우저에 저장했습니다.').waitFor();
  await page.screenshot({ path: 'work/team.png', fullPage: true });

  await page.getByRole('button', { name: '싱글 출전' }).click();
  await page.locator('.scene-mode').waitFor();
  await page.getByText('스프라이트 미제공').first().waitFor();
  await page.getByRole('button', { name: /싸운다/ }).click();
  await page.getByRole('button', { name: /10만볼트/ }).click();
  await page.getByRole('button', { name: /행동 결정/ }).click();
  await page.waitForFunction(() => document.querySelector('.scene-mode')?.textContent?.includes('TURN 02'));
  await page.screenshot({ path: 'work/single.png', fullPage: true });

  await page.getByRole('button', { name: /나가기/ }).click();
  await page.getByRole('button', { name: '더블 배틀' }).first().click();
  await page.locator('.scene-mode').waitFor();
  await page.getByRole('button', { name: /싸운다/ }).click();
  await page.getByRole('button', { name: /10만볼트/ }).click();
  await page.getByRole('button', { name: /상대 · 갸라도스/ }).click();
  await page.locator('.action-actors').getByRole('button', { name: /리자몽/ }).click();
  await page.getByRole('button', { name: /싸운다/ }).click();
  await page.getByRole('button', { name: /화염방사/ }).click();
  await page.getByRole('button', { name: /상대 · 마기라스/ }).click();
  await page.getByRole('button', { name: /행동 결정/ }).click();
  await page.waitForFunction(() => document.querySelector('.scene-mode')?.textContent?.includes('TURN 02'));
  await page.screenshot({ path: 'work/double.png', fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: /전략을 세우고/ }).waitFor();
  await mobile.screenshot({ path: 'work/mobile-home.png', fullPage: true });
  await mobile.getByRole('button', { name: '메뉴 열기' }).click();
  await mobile.getByRole('button', { name: '팀 편성', exact: true }).click();
  await mobile.getByRole('heading', { name: '팀 편성' }).waitFor();
  await mobile.locator('.team-page').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await mobile.screenshot({ path: 'work/mobile-team.png', fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Mobile horizontal overflow: ${overflow}px`);
  await mobile.getByRole('button', { name: '싱글 출전' }).click();
  await mobile.locator('.scene-mode').waitFor();
  await mobile.locator('.battle-page').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await mobile.screenshot({ path: 'work/mobile-battle.png', fullPage: true });

  if (errors.length) throw new Error(`Browser page errors: ${errors.join('; ')}`);
  console.log('BROWSER_SMOKE_OK: home, team change/save, singles turn, doubles turn, mobile layout; no page errors');
} finally {
  await browser?.close();
  await server.close();
}
