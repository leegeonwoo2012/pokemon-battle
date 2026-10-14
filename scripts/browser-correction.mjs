import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {selectTeamPreview} from './browser-preview.mjs';
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const server=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true},logLevel:'error'});
const report={passed:false,errors:[],imageErrors:[],layouts:[],controls:{}};mkdirSync('work',{recursive:true});let browser,page;
try {
  await server.listen();browser=await chromium.launch({executablePath,headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{if(response.url().includes('/sprites/')&&!response.ok())report.imageErrors.push(response.url());});
  const origin='http://127.0.0.1:5193';
  await page.addInitScript(()=>Date.now=()=>123456789);
  async function setup(id,format='singles',onlyOne=false){
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(async({id,onlyOne})=>{
      const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');const first={...createSet(id),itemId:'none'};
      if(id==='charizard')first.moves=['flamethrower','airslash','roost','protect'];
      const bench=['raichu','blastoise','charizard'].filter(species=>species!==id).slice(0,2).map(species=>createSet(species));
      const team=onlyOne?[first]:[first,...bench];
      localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team}));localStorage.setItem('arena-reduced-motion','false');localStorage.setItem('arena-playback-rate','1.5');
    },{id,onlyOne});
    await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:format==='singles'?'싱글 배틀 시작':'더블 배틀',exact:true}).click();
    await selectTeamPreview(page);
    await page.waitForFunction(()=>[...document.querySelectorAll('.scene-actor .pokemon-sprite')].every(image=>image.complete&&image.naturalWidth>0));
  }
  const viewports=[{width:1440,height:900},{width:1024,height:768},{width:390,height:844}];
  const cases=viewports.flatMap(viewport=>['ribombee','raichu','charizard','venusaur','dondozo'].map(id=>({viewport,id,format:'singles'})));
  cases.push(...[...viewports,{width:390,height:667}].map(viewport=>({viewport,id:'dondozo',format:'doubles'})));
  for(const {viewport,id,format} of cases){
    await page.setViewportSize(viewport);await setup(id,format);await page.getByRole('button',{name:'싸운다',exact:true}).click();
    await page.waitForTimeout(250); // Capture settled menus, not the entrance fade.
    if(viewport.width<=1100)assert(Number(await page.locator('.move-power').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)))>=10);
    assert(await page.locator('.move-name').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),'move names must be fully readable');
    const layout=await page.evaluate(()=>{
      const panels=[...document.querySelectorAll('.battle-status-plate,.battle-action-box,.battle-message-box')].map(node=>node.getBoundingClientRect()),overlaps=[];
      const actors=[...document.querySelectorAll('.scene-actor')].map(actor=>{
        const crop=actor.querySelector('.sprite-crop').getBoundingClientRect(),shadow=actor.querySelector('.actor-shadow').getBoundingClientRect();
        for(const panel of panels){const w=Math.min(crop.right,panel.right)-Math.max(crop.left,panel.left),h=Math.min(crop.bottom,panel.bottom)-Math.max(crop.top,panel.top);if(w>1&&h>1)overlaps.push({species:actor.dataset.species,w,h});}
        return {species:actor.dataset.species,physicalHeight:Number(actor.dataset.heightM),scale:Number(actor.dataset.visualScale),bodyWidth:crop.width,bodyHeight:crop.height,groundGap:Math.abs(crop.bottom-(shadow.top+shadow.height/2)),source:actor.querySelector('img').getAttribute('src')};
      });return {actors,overlaps,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(layout.actors.find(actor=>actor.source.includes('/back/'))?.species,id,'fixture must display the requested species');
    assert.equal(layout.actors.length,format==='doubles'?4:2);
    assert.equal(layout.overflow,0);assert.deepEqual(layout.overlaps,[]);for(const actor of layout.actors)assert(actor.groundGap<10,'grounded '+actor.species);
    report.layouts.push({id,format,...viewport,...layout});await page.screenshot({path:`work/correction-${id}-${format}-${viewport.width}-${viewport.height}.png`});
  }
  await page.setViewportSize({width:1440,height:900});await setup('blastoise');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await page.locator('.battle-action-box').getAttribute('data-menu'),'moves');
  await page.keyboard.press('2');assert.equal(await page.locator('.queued-choice').count(),1);
  await page.getByRole('button',{name:'배경음악 켜기',exact:true}).click();assert.equal(await page.getByRole('button',{name:'배경음악 끄기'}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'전장과 기술 설명'}).click();await page.getByRole('dialog',{name:'전장과 기술 설명'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.battle-details').count(),0);
  await page.getByRole('button',{name:/행동 결정/}).click();
  await page.waitForFunction(()=>document.querySelector('.battle-scene')?.dataset.motionPhase==='prepare',null,{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('.battle-scene')?.dataset.motionPhase==='cast',null,{timeout:10000});
  report.controls.keyboard=true;report.controls.musicAndHelp=true;report.controls.prepareThenCast=true;
  await page.getByRole('button',{name:'연출 건너뛰기'}).click();await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false');
  // Standard gamepad input is emulated; physical controller hardware is not claimed as tested.
  await page.evaluate(()=>{window.testPad={mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.testPad]});window.testPad.axes[0]=1;});
  await page.waitForTimeout(70);await page.evaluate(()=>{window.testPad.axes[0]=0;window.testPad.buttons[0].pressed=true;});
  await page.waitForFunction(()=>document.querySelector('.battle-action-box')?.dataset.menu==='moves');
  await page.waitForTimeout(100);assert.equal(await page.locator('.queued-choice').count(),0); // Holding A must not select through two menus.
  await page.evaluate(()=>window.testPad.buttons[0].pressed=false);report.controls.emulatedGamepad=true;
  // A completed faint pose must not leak into rematch with identical stable UIDs.
  await setup('charizard','singles',true);await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('.move-actions').getByRole('button',{name:/화염방사/}).click();await page.getByRole('button',{name:/행동 결정/}).click();
  await page.getByRole('dialog',{name:'배틀 결과'}).waitFor({timeout:45000});await page.getByRole('dialog',{name:'배틀 결과'}).getByRole('button',{name:'다시 대전'}).click();
  await page.waitForFunction(()=>document.querySelector('.actor-player')&&!document.querySelector('.actor-player').classList.contains('actor-fainted'));
  assert.equal(await page.locator('.actor-player .sprite-art').evaluate(node=>getComputedStyle(node).opacity),'1');report.controls.rematchClearsFaintPose=true;
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.imageErrors,[]);report.passed=true;console.log('BROWSER_CORRECTION_OK '+JSON.stringify(report));
}catch(error){report.error=String(error);await page?.screenshot({path:'work/correction-failure.png'}).catch(()=>{});throw error;}
finally{writeFileSync('work/correction-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await server.close();}
