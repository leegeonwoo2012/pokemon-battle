import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startFriendServer } from './friend-server.mjs';

const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!executablePath) throw Error('Chrome 또는 Edge가 필요합니다.');
mkdirSync('work', { recursive: true });
const relay = startFriendServer(0, '127.0.0.1');
await new Promise((resolve, reject) => { relay.http.once('listening', resolve); relay.http.once('error', reject); });
process.env.FRIEND_PORT = String(relay.http.address().port);
const vite = await createServer({ server: { host: '127.0.0.1', port: 5185, strictPort: true }, logLevel: 'error' });
const report = { passed: false, browserErrors: [], friendFrames: [] };
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  for (const page of [host, guest]) page.on('pageerror', error => report.browserErrors.push(error.message));
  await host.goto('http://127.0.0.1:5185/', { waitUntil: 'networkidle' });
  for(const page of [host,guest]){
    if(page===guest)await guest.goto('http://127.0.0.1:5185/',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
      const lead={...createSet('raichu'),moves:['thunderbolt','quickattack','thunderwave','protect']};
      localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team:[lead,...['charizard','gyarados','blastoise','venusaur','arcanine'].map(createSet)]}));
    });
    await page.reload({waitUntil:'networkidle'});
  }
  await host.getByRole('button', { name: '친구 친선전', exact: true }).first().click();
  await host.getByLabel('트레이너 이름').fill('호스트');
  await host.getByRole('button', { name: /방 만들기/ }).click();
  await host.getByLabel('친선 대전 코드').waitFor();
  const code = (await host.getByLabel('친선 대전 코드').innerText()).trim();
  assert.match(code, /^\d{6}$/);

  await guest.goto(`http://127.0.0.1:5185/?friendCode=${code}#friend`, { waitUntil: 'networkidle' });
  await guest.getByLabel('트레이너 이름').fill('친구');
  await guest.getByRole('button', { name: '코드로 참가', exact: true }).click();
  await host.getByRole('button', { name: /팀 프리뷰 시작/ }).waitFor({ timeout: 15000 });
  assert((await guest.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  report.mobileFriendlyLobby = true;
  await host.screenshot({ path: 'work/friend-lobby.png', fullPage: true });
  await host.getByRole('button', { name: /팀 프리뷰 시작/ }).click();
  await Promise.all([host.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor(),guest.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor()]);
  await host.screenshot({path:'work/team-preview-desktop.png',fullPage:true});
  await guest.screenshot({path:'work/team-preview-mobile.png',fullPage:true});
  for(const page of [host,guest]){
    await page.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor();
    for(const name of ['라이츄','리자몽','갸라도스'])await page.getByRole('button',{name:new RegExp(`${name} 선출`)}).first().click();
    await page.getByRole('button',{name:/3마리 선출 완료/}).click();
  }
  await host.locator('.battle-scene').waitFor();
  await guest.locator('.battle-scene').waitFor({ timeout: 15000 });
  assert((await guest.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  report.mobileFriendlyBattle = true;
  await host.waitForFunction(() => document.querySelector('.scene-mode')?.textContent.includes('호스트 VS 친구'));
  await guest.waitForFunction(() => document.querySelector('.scene-mode')?.textContent.includes('친구 VS 호스트'));
  report.connectedWithPerspectiveNames = true;

  async function chooseMove(page, pattern) {
    await page.getByRole('button', { name: '싸운다', exact: true }).click();
    await page.locator('.move-actions').getByRole('button', { name: pattern }).click();
    await page.getByRole('button', { name: /행동 결정/ }).click();
  }
  await chooseMove(guest, /10만볼트/);
  report.friendFrames.push(await host.locator('.battle-scene').getAttribute('aria-busy'));
  await chooseMove(host, /전광석화/);
  for (const page of [host, guest]) await page.waitForFunction(() => document.querySelector('.scene-mode')?.textContent.includes('TURN 02') && document.querySelector('.battle-scene')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  await host.getByRole('button', { name: '기록', exact: true }).click();
  await guest.getByRole('button', { name: '기록', exact: true }).click();
  const hostLog = await host.locator('.history-lines').innerText();
  const guestLog = await guest.locator('.history-lines').innerText();
  assert.match(hostLog, /10만볼트 사용!/); assert.match(hostLog, /전광석화 사용!/);
  assert.match(guestLog, /10만볼트 사용!/); assert.match(guestLog, /전광석화 사용!/);
  await host.screenshot({ path: 'work/friend-battle-turn.png', fullPage: true });
  report.hostAndGuestShareTheSameResolvedTurn = true;
  report.hostTurn = await host.locator('.scene-mode').innerText();
  report.guestTurn = await guest.locator('.scene-mode').innerText();
  // Reload one real browser after the other has committed its choice. The server keeps it.
  for(const page of [host,guest])await page.getByRole('button',{name:'기록 닫기'}).click();
  await chooseMove(host,/전광석화/);
  await guest.reload({waitUntil:'networkidle'});
  await guest.locator('.battle-scene').waitFor({timeout:15000});
  assert.match(await guest.locator('.scene-mode').innerText(),/TURN 02/);
  await chooseMove(guest,/전광석화/);
  await host.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='true');
  await host.getByRole('button',{name:/연출 건너뛰기/}).click();
  for(const page of [host,guest])await page.waitForFunction(()=>document.querySelector('.scene-mode')?.textContent.includes('TURN 03')&&document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',null,{timeout:30000});
  report.browserReloadRestoresRoomAndPendingOpponentChoice=true;
  report.serverSkipSynchronizesBothPlayers=true;
  // Reconnect two real clients with teams that produce a knockout, then verify a free replacement phase.
  await host.getByRole('button', { name: '나가기', exact: true }).click();
  await guest.getByRole('button',{name:'친구 친선전',exact:true}).first().waitFor();
  for (const [page, role] of [[host, 'host'], [guest, 'guest']]) {
    await page.goto('http://127.0.0.1:5185/', { waitUntil: 'networkidle' });
    await page.evaluate(async role => {
      const { createSet, TEAM_STORAGE_KEY } = await import('/src/team/index.ts');
      const lead = role === 'host' ? { ...createSet('charizard'), itemId: 'none', ivs: { hp: 0 }, evs: { spa: 252, spe: 252 }, moves: ['flamethrower', 'airslash', 'roost', 'protect'] } : { ...createSet('raichu'), natureId:'modest', evs:{spa:252,spe:252}, moves:['thunderbolt','quickattack','thunderwave','protect'] };
      const team = [lead,createSet(role === 'host' ? 'gyarados' : 'blastoise'),...['venusaur','arcanine','lucario','gardevoir'].map(createSet)];
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify({ version: 1, team }));
      localStorage.setItem('arena-reduced-motion', 'true'); localStorage.setItem('arena-playback-rate', '1.5');
    }, role);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '친구 친선전', exact: true }).first().click();
  }
  await host.getByRole('button', { name: /방 만들기/ }).click();
  const nextCode = (await host.getByLabel('친선 대전 코드').innerText()).trim();
  await guest.getByLabel('친구의 방 코드').fill(nextCode);
  await guest.getByRole('button', { name: '코드로 참가', exact: true }).click();
  await host.getByRole('button', { name: /팀 프리뷰 시작/ }).click();
  for(const page of [host,guest]){
    await page.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor();
    for(let index=0;index<3;index++)await page.locator('.team-preview-roster').first().getByRole('button').nth(index).click();
    await page.getByRole('button',{name:/3마리 선출 완료/}).click();
  }
  await host.locator('.battle-scene').waitFor(); await guest.locator('.battle-scene').waitFor();
  await chooseMove(guest, /10만볼트/); await chooseMove(host, /화염방사/);
  for (const page of [host, guest]) await page.waitForFunction(() => document.querySelector('.scene-mode')?.textContent.includes('TURN 02') && document.querySelector('.battle-scene')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  assert.equal(await host.locator('.battle-action-box').getAttribute('data-menu'), 'party');
  await host.locator('.party-actions').getByRole('button', { name: /갸라도스/ }).click();
  await host.getByRole('button', { name: /행동 결정/ }).click();
  for (const page of [host, guest]) await page.waitForFunction(() => document.querySelector('.battle-scene')?.getAttribute('aria-busy') === 'false' && document.querySelector('.battle-action-box')?.getAttribute('data-menu') !== 'party' && document.querySelector('.formation-foe [data-species="gyarados"], .formation-player [data-species="gyarados"]'), null, { timeout: 30000 });
  assert.equal(await host.locator('.formation-player [data-species="gyarados"]').count(), 1);
  assert.equal(await guest.locator('.formation-foe [data-species="gyarados"]').count(), 1);
  assert.match(await host.locator('.scene-mode').innerText(), /TURN 02/);
  assert.match(await guest.locator('.scene-mode').innerText(), /TURN 02/);
  report.friendlyManualReplacementSyncedWithoutConsumingTurn = true;
  assert.deepEqual(report.browserErrors, []);
  report.passed = true;
  writeFileSync('work/friend-browser-report.json', JSON.stringify(report, null, 2));
  console.log('BROWSER_FRIEND_OK ' + JSON.stringify(report));
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  writeFileSync('work/friend-browser-report.json', JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  await vite.close();
  await relay.close();
}
