import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw Error('Chrome 또는 Edge가 필요합니다.');
const vite=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},logLevel:'error'});
let browser;
try{
  await vite.listen();browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5197/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
    const lead={...createSet('meowscarada'),moves:['flowertrick','knockoff','uturn','protect']};
    localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team:[lead,...['blastoise','raichu','charizard','venusaur','gyarados'].map(createSet)]}));
    localStorage.setItem('arena-reduced-motion','false');
  });
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'싱글 배틀 시작',exact:true}).click();
  for(const index of [0,1,2])await page.locator('.team-preview-roster').first().getByRole('button').nth(index).click();
  await page.getByRole('button',{name:'3마리 선출 완료'}).click();
  await page.getByRole('button',{name:'배틀 시작',exact:true}).click();
  const before=Number(await page.locator('.status-stack-foe [role="meter"]').first().getAttribute('aria-valuenow'));
  await page.evaluate(()=>{
    window.hitSeen=[];
    const scene=document.querySelector('.battle-scene');
    window.hitObserver=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){
        if(node.nodeType===1&&node.classList.contains('battle-vfx'))window.hitSeen.push(node.className);
      }
    });
    window.hitObserver.observe(scene,{childList:true,subtree:true});
  });
  await page.getByRole('button',{name:'싸운다',exact:true}).click();
  await page.locator('[data-move-id="flowertrick"]').click();
  await page.getByRole('button',{name:'행동 결정',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.scene-mode')?.textContent.includes('TURN 02')&&document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',null,{timeout:45000});
  const seen=await page.evaluate(()=>window.hitSeen);
  assert(seen.some(name=>name.includes('hit-popup-critical')),JSON.stringify(seen));
  assert(seen.some(name=>name.includes('hit-popup-super')),JSON.stringify(seen));
  assert(seen.some(name=>name.includes('hit-flash-gold')),JSON.stringify(seen));
  const after=Number(await page.locator('.status-stack-foe [role="meter"]').first().getAttribute('aria-valuenow'));
  assert(after<before,`foe HP ${before} -> ${after}`);
  assert.deepEqual(errors,[]);
  console.log('BROWSER_HIT_EFFECTS_OK '+JSON.stringify({critical:true,superEffective:true,flash:true,beforeHp:before,afterHp:after,errors}));
}finally{await browser?.close();await vite.close();}
