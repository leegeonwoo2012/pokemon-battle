import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { selectTeamPreview } from './browser-preview.mjs';

const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw Error('Chrome 또는 Edge 실행 파일이 필요합니다.');
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'error'});
mkdirSync('work',{recursive:true});
const report={passed:false,errors:[],sprite:null};let browser,page;
try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5197/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
    const set={...createSet('zygarde'),itemId:'zygardite',moves:['nihillight','thousandarrows','coreenforcer','protect']};
    localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team:[set]}));
    localStorage.setItem('arena-reduced-motion','false');
  });
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('combobox',{name:'CPU 배틀 초전설 제한'}).selectOption('1');
  await page.getByRole('button',{name:'싱글 배틀 시작',exact:true}).click();
  await selectTeamPreview(page);
  await page.locator('.battle-scene').waitFor();
  await page.locator('[data-gimmick="mega"]').click();
  await page.locator('[data-move-id="nihillight"]').click();
  if(await page.locator('.target-actions').count())await page.locator('.target-actions>button:not(.action-back)').first().click();
  await page.getByRole('button',{name:'행동 결정',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.battle-scene')?.dataset.eventKind==='gimmick-transform'&&document.querySelector('.battle-scene')?.dataset.eventActor==='player-0',null,{timeout:20000});
  await page.locator('.stadium-transform-spotlight').waitFor({timeout:20000});
  await page.waitForFunction(()=>{const image=document.querySelector('.formation-player img[src*="zygardemega-back.png"]');return image?.complete&&image.naturalWidth===512;},null,{timeout:20000});
  report.sprite=await page.locator('.formation-player img[src*="zygardemega-back.png"]').evaluate(image=>({src:new URL(image.src).pathname,width:image.naturalWidth,height:image.naturalHeight}));
  assert.deepEqual(report.sprite,{src:'/sprites/forms/zygardemega-back.png',width:512,height:512});
  assert.deepEqual(report.errors,[]);report.passed=true;
  await page.screenshot({path:'work/mega-zygarde-browser.png'});
  console.log('MEGA_ZYGARDE_BROWSER_OK '+JSON.stringify(report));
}catch(error){report.error=String(error);await page?.screenshot({path:'work/mega-zygarde-failure.png'}).catch(()=>{});throw error;}
finally{writeFileSync('work/mega-zygarde-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await server.close();}
