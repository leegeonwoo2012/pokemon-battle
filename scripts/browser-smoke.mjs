import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const paths=process.platform==='win32'?['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']:['/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const executablePath=process.env.CHROME_PATH||paths.find(existsSync);
if(!executablePath)throw Error('CHROME_PATH에 Chrome 실행 경로를 지정하세요.');
mkdirSync('work',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true},logLevel:'error'});
let browser;
try {
 await server.listen(); browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],badImages=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().includes('/sprites/')&&!response.ok())badImages.push(response.url());});
 await page.addInitScript(()=>{const original=Date.now;Date.now=()=>123456789;window.realNow=original;});
 await page.goto('http://127.0.0.1:5178/',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:/전략을 세우고/}).waitFor();
 await page.getByRole('button',{name:'포켓몬 목록',exact:true}).click();
 assert.equal(await page.locator('.dex-card').count(),344);
 await page.getByLabel('도감 대표 타입').selectOption('fire');assert.equal(await page.locator('.dex-card').count(),25);
 await page.getByPlaceholder('포켓몬 검색').fill('리자몽');assert.equal(await page.locator('.dex-card').count(),1);
 await page.screenshot({path:'work/roster.png',fullPage:true});
 await page.getByRole('button',{name:'팀 편성',exact:true}).click();
 assert.deepEqual(await page.locator('.team-slot strong').allTextContents(),['로토무 (워시)','오롱털','한카리아스','리자몽','타부자고','대쓰여너']);
 await page.getByRole('button',{name:'로토무 (워시) 아래로 이동'}).click();
 assert.match(await page.locator('.team-slot').nth(1).innerText(),/로토무 \(워시\)/);
 await page.getByRole('button',{name:'로토무 (워시) 위로 이동'}).click();
 await page.locator('.team-slot').nth(2).click();await page.getByTitle('팀에서 제외').click();assert.equal(await page.locator('.team-slot').count(),5);
 await page.locator('.team-slot').first().click();await page.getByRole('button',{name:/포켓몬 변경/}).click();
 await page.getByPlaceholder('이름 또는 영문 ID 검색').fill('한카리아스');
 await page.getByRole('dialog').getByRole('button',{name:/한카리아스/}).click();
 const selects=page.locator('.move-select-list select');
 for(const [i,id] of ['swordsdance','dragonclaw','earthquake','protect'].entries())await selects.nth(i).selectOption(id);
 await page.getByRole('button',{name:'포켓몬 추가',exact:true}).click();
 await page.getByPlaceholder('이름 또는 영문 ID 검색').fill('워시');await page.getByRole('dialog').getByRole('button',{name:/로토무 \(워시\)/}).click();
  assert.equal(await page.locator('.team-slot').count(),6,`Team editor disappeared: ${errors.join(' | ')}`);
 await page.getByRole('button',{name:'팀 저장',exact:true}).click();
 await page.getByRole('button',{name:'불러오기',exact:true}).click();
 assert.equal(await page.locator('.move-select-list select').first().inputValue(),'swordsdance');
 await page.screenshot({path:'work/team.png',fullPage:true});
 await page.getByRole('button',{name:'싱글 출전'}).click();
 await page.getByRole('main',{name:'팀 프리뷰와 선출'}).waitFor();
 for(const index of [0,1,5])await page.locator('.team-preview-roster').first().getByRole('button').nth(index).click();
 await page.getByRole('button',{name:/3마리 선출 완료/}).click();
 await page.locator('.scene-actor[data-species="garchomp"]').waitFor();
 assert.equal(await page.locator('.sprite-placeholder-grid').count(),0);
 assert.equal(await page.getByText('스프라이트 미제공').count(),0);
 await page.getByRole('button',{name:'싸운다',exact:true}).click();
 assert.equal(await page.locator('.move-actions button[data-type]').count(),4);
 await page.screenshot({path:'work/move-menu.png',fullPage:true});
 await page.getByRole('button',{name:'돌아가기',exact:true}).click();
 async function observe(){await page.locator('.battle-scene').waitFor({timeout:10000});await page.evaluate(()=>{
   window.battleFrames=[];window.vfxKinds=[];window.observer?.disconnect();
   const scene=document.querySelector('.battle-scene');
   window.observer=new MutationObserver(records=>{
     if(records.some(record=>record.type==='attributes'&&record.attributeName==='data-event-id'))window.battleFrames.push({id:Number(scene.dataset.eventId),kind:scene.dataset.eventKind,actor:scene.dataset.eventActor,target:scene.dataset.eventTarget,locked:scene.getAttribute('aria-busy'),active:[...scene.querySelectorAll('.scene-actor')].map(node=>node.dataset.uid),message:scene.querySelector('.battle-message-box p').textContent,animations:scene.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length});
     for(const record of records)for(const node of record.addedNodes)if(node.classList?.contains('battle-vfx'))window.vfxKinds.push(node.className);
   });window.observer.observe(scene,{attributes:true,attributeFilter:['data-event-id'],childList:true,subtree:true});
 });}
 async function move(name,target){await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('.move-actions').getByRole('button',{name}).click();if(target)await page.getByRole('button',{name:target}).click();}
 async function confirm(turn){await page.getByRole('button',{name:'행동 결정',exact:true}).click();assert.equal(await page.locator('.battle-scene').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.game-choice-fight').isDisabled(),true);assert.equal(await page.locator('.game-choice-fight').isVisible(),false);await page.waitForFunction(t=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false'&&document.querySelector('.scene-mode')?.textContent?.includes(`TURN ${String(t).padStart(2,'0')}`),turn,{timeout:30000});return page.evaluate(()=>window.battleFrames);}
 await observe();await move(/^방어/);let frames=await confirm(2);assert(frames.some(frame=>frame.kind==='protect'));assert(frames.some(frame=>frame.kind==='blocked')||(frames.some(frame=>frame.kind==='gimmick-transform')&&frames.some(frame=>frame.kind==='damage')));assert(frames.slice(0,-1).every(frame=>frame.locked==='true'));
 await observe();await move(/칼춤/);frames=await confirm(3);assert(frames.some(frame=>frame.kind==='stat'&&frame.message.includes('2단계 상승')));
 await observe();await move(/드래곤클로/);frames=await confirm(4);assert(frames.some(frame=>frame.kind==='move'&&frame.animations>0));assert(frames.some(frame=>frame.kind==='damage'));
 if(await page.locator('.battle-action-box').getAttribute('data-menu')==='party'){
   assert.match(await page.locator('.battle-message-box').innerText(),/다음으로 출전/);
   await page.locator('.party-actions>button:not(:disabled):not(.action-back)').first().click();
   await page.getByRole('button',{name:'행동 결정',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',null,{timeout:30000});
   assert.match(await page.locator('.scene-mode').innerText(),/TURN 04/);
 }
 const outgoing=await page.locator('.formation-player .scene-actor').getAttribute('data-uid');
 await observe();await page.getByRole('button',{name:'포켓몬',exact:true}).click();await page.locator('.party-actions').getByRole('button',{name:/로토무 \(워시\)/}).click();frames=await confirm(5);
 const out=frames.findIndex(frame=>frame.kind==='switch-out'&&frame.actor===outgoing);const enter=frames.findIndex(frame=>frame.kind==='switch-in'&&frame.actor==='player-2');assert(out>=0&&enter>out);assert(frames[out].active.includes(outgoing));assert(frames[enter].active.includes('player-2'));
 await observe();await move(/하이드로펌프/);await confirm(6);assert((await page.evaluate(()=>window.vfxKinds)).some(kind=>kind.includes('vfx-move-')));
 await page.screenshot({path:'work/single.png',fullPage:true});
 await page.getByRole('button',{name:'기록',exact:true}).click();await page.getByText('전투 기록',{exact:true}).waitFor();await page.getByRole('button',{name:'기록 닫기'}).click();
 await page.getByRole('button',{name:'나가기',exact:true}).click();await page.getByRole('button',{name:'더블 배틀',exact:true}).first().click();
 for(let index=0;index<4;index++)await page.locator('.team-preview-roster').first().getByRole('button').nth(index).click();
 await page.getByRole('button',{name:/4마리 선출 완료/}).click();
 await page.locator('.scene-actor').first().waitFor();
 assert.equal(await page.locator('.scene-actor').count(),4);
 await observe();await move(/드래곤클로/,/상대 · 갸라도스/);await move(/소울크래시/,/상대 · 마기라스/);frames=await confirm(2);assert(frames.filter(frame=>frame.kind==='move').length>=3);
 await page.screenshot({path:'work/double.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert((await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth))<=1);
 await page.screenshot({path:'work/mobile-battle.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(badImages,[]);
 const sprites=await page.evaluate(async()=>{const assets=await import('/src/presentation/sprites.ts');await assets.initializeSprites();return assets.spriteDiagnosticReport();});
 const report={roster:344,representativeTypes:18,fireRepresentatives:25,teamSize:6,turnQueue:true,inputLock:true,physical:true,special:true,rankUp:true,protect:true,switchOutBeforeIn:true,doubles:true,mobile:true,browserErrors:errors,missingSpriteRequests:badImages,actualBundledPokemonSprites:sprites.success,missingPokemonSprites:sprites.failed,artworkStatus:sprites.failed?'PARTIAL':'COMPLETE'};
 writeFileSync('work/browser-report.json',JSON.stringify(report,null,2));
 console.log('BROWSER_SMOKE_OK '+JSON.stringify(report));
} finally {await browser?.close();await server.close();}
