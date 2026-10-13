import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const executablePath = process.env.CHROME_PATH || [
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
 '/usr/bin/google-chrome','/usr/bin/chromium',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
if (!executablePath) throw Error('CHROME_PATH를 설정하세요.');
mkdirSync('work',{recursive:true});
const server = await createServer({server:{host:'127.0.0.1',port:5182,strictPort:true},logLevel:'error'});
let browser;
try {
 await server.listen();
 browser = await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
 const page = await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
 page.on('pageerror',e => errors.push(e.message));
 await page.addInitScript(() => {Date.now = () => 123456789; localStorage.setItem('arena-reduced-motion','true');});
 await page.goto('http://127.0.0.1:5182/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'팀 편성',exact:true}).click();
 await page.locator('.team-slot').first().click();
 await page.getByRole('button',{name:/포켓몬 변경/}).click();
 await page.getByPlaceholder('이름 또는 영문 ID 검색').fill('gengar');
 await page.getByRole('dialog').getByRole('button',{name:/팬텀/}).click();
 for (const [i,id] of ['confuseray','shadowball','sludgebomb','protect'].entries()) await page.locator('.move-select-list select').nth(i).selectOption(id);
 await page.getByLabel('성격').selectOption('timid');
 for (const [i,ev] of [252,0,0,0,4,252].entries()) await page.locator('.stat-editor').nth(i).getByRole('spinbutton').first().fill(String(ev));
 await page.getByRole('button',{name:'팀 저장',exact:true}).click();
 await page.getByRole('button',{name:'싱글 출전',exact:true}).click();
 await page.getByRole('button',{name:'싸운다',exact:true}).click();
 await page.locator('.move-actions').getByRole('button',{name:/이상한빛/}).click();
 await page.getByRole('button',{name:'행동 결정',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false'
   && document.querySelector('.scene-mode')?.textContent?.includes('TURN 02'));
 assert.equal(await page.locator('.status-stack-foe [data-condition="confusion"]').count(),1);
 await page.getByRole('button',{name:'기록',exact:true}).click();
 const log = await page.locator('.history-lines').innerText();
 assert(log.includes('팬텀: 이상한빛 사용!'));
 assert(log.includes('마기라스이(가) 혼란에 빠졌다!'));
 await page.getByRole('button',{name:'기록 닫기'}).click();
 await page.screenshot({path:'work/confusion-battle.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.status-stack-foe [data-condition="confusion"]').count(),1);
 assert((await page.evaluate(() => document.documentElement.scrollWidth-window.innerWidth))<=1);
 assert.deepEqual(errors,[]);
 const report={passed:true,actualConfuseRayTurn:true,engineStatusInInformationWindow:true,mobile:true,browserErrors:errors,log};
 writeFileSync('work/browser-conditions-report.json',JSON.stringify(report,null,2));
 console.log('BROWSER_CONDITIONS_OK '+JSON.stringify(report));
} finally {await browser?.close(); await server.close();}
