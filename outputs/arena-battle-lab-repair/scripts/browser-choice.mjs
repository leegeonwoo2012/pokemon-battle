import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = process.env.CHROME_PATH || browserPaths.find(existsSync);
if (!executablePath) throw Error('CHROME_PATH에 Chrome 또는 Edge 실행 경로를 지정하세요.');

mkdirSync('work', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5181, strictPort: true }, logLevel: 'error' });
const report = { passed: false, seed: 123456789, browserErrors: [], checks: {} };
let browser;
let page;

try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  report.browser = { executablePath, version: browser.version() };
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.addInitScript(() => {
    // Fixed PRNG seed, without modifying battle state or faking engine outcomes.
    Date.now = () => 123456789;
    localStorage.setItem('arena-reduced-motion', 'true');
  });
  await page.goto('http://127.0.0.1:5181/', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: '팀 편성', exact: true }).click();
  await page.locator('.team-slot').first().click();
  await page.getByLabel(/지닌 도구/).selectOption('choiceScarf');
  await page.getByLabel('성격').selectOption('bold');
  // Legal defensive EVs let Pikachu survive the incoming move on its return.
  for (const [index, ev] of [252, 0, 252, 0, 4, 0].entries()) {
    await page.locator('.stat-editor').nth(index).getByRole('spinbutton').first().fill(String(ev));
  }
  await page.getByRole('button', { name: '팀 저장', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('battle-circuit-team-v1')));
  assert.equal(saved.team[0].speciesId, 'pikachu');
  assert.equal(saved.team[0].itemId, 'choiceScarf');
  assert.equal(saved.team[0].evs.hp, 252);
  report.checks.editedAndSavedChoiceScarfThroughUi = true;
  report.playerConfiguration = saved.team[0];

  await page.getByRole('button', { name: '싱글 출전', exact: true }).click();
  await page.locator('.formation-player .scene-actor[data-species="pikachu"]').waitFor();

  async function confirm(nextTurn, speciesId) {
    await page.getByRole('button', { name: '행동 결정', exact: true }).click();
    await page.waitForFunction(({ turn, species }) => {
      const scene = document.querySelector('.battle-scene');
      return scene?.getAttribute('aria-busy') === 'false'
        && scene.querySelector('.scene-mode')?.textContent.includes(`TURN ${String(turn).padStart(2, '0')}`)
        && scene.querySelector(`.formation-player .scene-actor[data-species="${species}"]:not(.actor-fainted)`);
    }, { turn: nextTurn, species: speciesId }, { timeout: 30000 });
  }
  async function switchTo(name, speciesId, turn) {
    await page.getByRole('button', { name: '포켓몬', exact: true }).click();
    await page.locator('.party-actions').getByRole('button', { name }).click();
    await confirm(turn, speciesId);
  }

  await page.getByRole('button', { name: '싸운다', exact: true }).click();
  assert.equal(await page.locator('.move-actions').getByRole('button', { name: /전광석화/ }).isEnabled(), true);
  await page.locator('.move-actions').getByRole('button', { name: /^방어/ }).click();
  await confirm(2, 'pikachu');
  await page.getByRole('button', { name: '싸운다', exact: true }).click();
  const quickAttack = page.locator('.move-actions').getByRole('button', { name: /전광석화/ });
  assert.equal(await quickAttack.isDisabled(), true);
  const lockReason = await quickAttack.getAttribute('title');
  assert.match(lockReason, /구애스카프.*방어만/);
  assert.equal(await page.locator('.move-actions').getByRole('button', { name: /^방어/ }).isEnabled(), true);
  assert.equal(await page.locator('.struggle-choice').count(), 0);
  report.checks.choiceLockAppliedAfterRealProtectTurn = true;
  report.checks.otherMovesDisabledWithReason = true;
  report.lockReason = lockReason;
  report.hpAfterProtect = await page.locator('.status-stack-player .plate-hp-text').innerText();
  await page.screenshot({ path: 'work/choice-lock.png', fullPage: true });

  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await switchTo(/거북왕/, 'blastoise', 3);
  report.checks.switchedToBlastoise = true;
  await switchTo(/피카츄/, 'pikachu', 4);
  report.checks.switchedBackToLivingPikachu = true;
  report.hpAfterReturn = await page.locator('.status-stack-player .plate-hp-text').innerText();
  await page.getByRole('button', { name: '싸운다', exact: true }).click();
  for (const moveName of [/10만볼트/, /전광석화/, /전기자석파/, /^방어/]) {
    const moveButton = page.locator('.move-actions').getByRole('button', { name: moveName });
    assert.equal(await moveButton.isEnabled(), true);
    assert.equal(await moveButton.getAttribute('title'), null);
  }
  report.checks.allFourMovesAvailableAfterSwitchReset = true;
  await page.screenshot({ path: 'work/choice-reset.png', fullPage: true });
  await page.getByRole('button', { name: '기록', exact: true }).click();
  const log = await page.locator('.history-lines').innerText();
  assert.match(log, /구애스카프/);
  assert.match(log, /거북왕/);
  assert.match(log, /피카츄/);
  report.battleLog = log;
  assert.deepEqual(report.browserErrors, []);
  report.passed = true;
  console.log('BROWSER_CHOICE_OK ' + JSON.stringify(report));
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  await page?.screenshot({ path: 'work/choice-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync('work/browser-choice-report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
