import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync,mkdirSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {selectTeamPreview} from './browser-preview.mjs';
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw Error('Chrome 또는 Edge 실행 파일이 필요합니다.');
const server=await createServer({server:{host:'127.0.0.1',port:5195,strictPort:true},logLevel:'error'});
const report={passed:false,errors:[],imageErrors:[],moves:[],layouts:[],gimmicks:[],checks:[]};
mkdirSync('work',{recursive:true});let browser,page;
try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{if(response.url().includes('/sprites/')&&!response.ok())report.imageErrors.push(response.url());});
  await page.addInitScript(()=>{
    Date.now=()=>123456789;window.audioStarts=[];
    const Real=window.AudioContext;
    window.AudioContext=class extends Real {
      createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=(...args)=>{window.audioStarts.push({kind:'tone'});return start(...args);};return node;}
      createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=(...args)=>{window.audioStarts.push({kind:'buffer',duration:node.buffer?.duration});return start(...args);};return node;}
    };
  });
  const origin='http://127.0.0.1:5195';
  async function setup(id,moveId='protect',format='singles',gear={}){
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(async({id,moveId,gear})=>{
      const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
      const lead={...createSet(id),...gear};lead.moves=[moveId,...lead.moves.filter(move=>move!==moveId)].slice(0,4);
      lead.evs={spe:252,hp:252,def:4};
      const bench=['blastoise','garchomp','charizard'].filter(species=>species!==id).slice(0,2).map(species=>{const set=createSet(species);if(species==='blastoise')set.moves=['surf','hydropump','icebeam','protect'];return set;});
      localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team:[lead,...bench]}));
      localStorage.setItem('arena-reduced-motion','false');localStorage.setItem('arena-playback-rate','1.5');localStorage.setItem('arena-sound','true');
    },{id,moveId,gear});
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:format==='singles'?'싱글 배틀 시작':'더블 배틀',exact:true}).click();
    await selectTeamPreview(page);
    await page.waitForFunction(()=>document.querySelector('.battle-scene')&&[...document.querySelectorAll('.scene-actor .pokemon-sprite')].every(image=>image.complete&&image.naturalWidth>0));
  }
  async function observe(){await page.evaluate(()=>{
    window.frames=[];window.vfx=[];window.battleObserver?.disconnect();
    const scene=document.querySelector('.battle-scene');
    const capture=()=>window.frames.push({id:scene.dataset.eventId,kind:scene.dataset.eventKind,actor:scene.dataset.eventActor,target:scene.dataset.eventTarget,phase:scene.dataset.motionPhase,
      hp:[...scene.querySelectorAll('.battle-status-plate')].map(node=>({uid:node.dataset.statusUid,actual:Number(node.dataset.actualHp),shown:Number(node.querySelector('[role="meter"]').getAttribute('aria-valuenow')),number:node.querySelector('.plate-hp-text strong')?.textContent})),
      camera:getComputedStyle(scene.querySelector('.battle-camera')).transform,hud:getComputedStyle(scene.querySelector('.plate-player')).transform});
    window.battleObserver=new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'&&['data-motion-phase','data-event-id'].includes(record.attributeName)))capture();for(const record of records)for(const node of record.addedNodes)if(node.classList?.contains('battle-vfx'))window.vfx.push(node.className);});
    window.battleObserver.observe(scene,{subtree:true,childList:true,attributes:true,attributeFilter:['data-motion-phase','data-event-id']});
  });}
  async function choose(moveId){await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('[data-move-id="'+moveId+'"]').click();}
  async function finish(){await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',null,{timeout:45000});}
  async function skip(){const button=page.getByRole('button',{name:'연출 건너뛰기',exact:true});if(await button.isVisible())await button.click();await finish();await page.waitForFunction(()=>!document.querySelector('.battle-vfx'));}

  if(!process.argv.includes('--layout-only')){
  for(const [id,moveId,family] of [['blastoise','surf','surf-wave'],['garchomp','earthquake','earthquake-fissure'],['garchomp','outrage','outrage-claw'],['gholdengo','steelbeam','steelbeam-lance']]){
    await setup(id,moveId);await observe();await choose(moveId);await page.getByRole('button',{name:'행동 결정',exact:true}).click();
    await page.locator('.vfx-move-'+family).first().waitFor({timeout:20000});await page.screenshot({path:'work/cinematic-'+moveId+'.png'});
    await finish();
    const data=await page.evaluate(()=>({frames:window.frames,vfx:window.vfx,audio:window.audioStarts.length}));
    const phases=data.frames.filter(frame=>frame.kind==='move'&&frame.actor==='player-0').map(frame=>frame.phase);
    assert(phases.indexOf('announce')>=0&&phases.indexOf('prepare')>phases.indexOf('announce')&&phases.indexOf('cast')>phases.indexOf('prepare'));
    assert(data.frames.some(frame=>frame.kind==='damage'&&frame.phase==='impact'&&frame.hp.some(hp=>hp.uid===frame.target&&hp.shown>hp.actual)),'HP must hold during impact');
    assert(data.frames.filter(frame=>frame.kind==='damage').every(frame=>frame.hud==='none'),'HUD must stay fixed');
    assert(data.audio>0,'Audio nodes actually started');
    if(moveId==='steelbeam'){await page.getByRole('button',{name:'기록',exact:true}).click();assert.match(await page.locator('.history-lines').innerText(),/철제광선의 반동/);}
    report.moves.push({id:moveId,phases,signatureRendered:true,hpDelayed:true,audioStarted:true});console.log('CINEMATIC_MOVE_OK '+moveId);
  }

  await setup('garchomp');await observe();await page.getByRole('button',{name:'포켓몬',exact:true}).click();await page.locator('.party-actions').getByRole('button',{name:/거북왕/}).click();await page.getByRole('button',{name:'행동 결정',exact:true}).click();await finish();
  const switches=await page.evaluate(()=>({frames:window.frames,vfx:window.vfx}));
  for(const phase of ['recall','throw','release','land'])assert(switches.frames.some(frame=>frame.phase===phase));
  assert(switches.vfx.some(name=>name.includes('recall-ball'))&&switches.vfx.some(name=>name.includes('sendout-ball')));report.checks.push('Recall beam → ball throw → release → landing');

  for(const [id,kind,itemId,moveId,gigantamax] of [['charizard','mega','charizarditey','flamethrower',false],['rotomwash','tera','tera-fire','hydropump',false],['blastoise','dynamax','none','surf',true]]){
    await setup(id,moveId,'singles',{itemId,gigantamax});await observe();const before=Number(await page.locator('.plate-player [role="meter"]').getAttribute('aria-valuemax'));
    await page.locator('[data-gimmick="'+kind+'"]').click();await page.locator('[data-move-id="'+moveId+'"]').click();await page.getByRole('button',{name:'행동 결정',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.battle-scene')?.dataset.eventKind==='gimmick-transform'&&document.querySelector('.battle-scene')?.dataset.eventActor==='player-0',null,{timeout:20000});
    await page.locator('.vfx-move-form-wash').waitFor();await page.screenshot({path:'work/cinematic-'+kind+'.png'});
    if(kind==='mega')assert.equal(await page.locator('.formation-player [data-form-sprite="true"]').count(),1);
    if(kind==='tera')assert.equal(await page.locator('.formation-player .tera-crown').count(),1);
    if(kind==='dynamax'){assert.equal(Number(await page.locator('.plate-player [role="meter"]').getAttribute('aria-valuemax')),before*2);assert.equal(await page.locator('.formation-player .form-gmax').count(),1);}
    report.gimmicks.push({kind,formRendered:true,distinctReveal:true});await skip();
  }

  await setup('garchomp','earthquake','doubles');await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('[data-move-id="earthquake"]').hover();
  assert.equal(await page.locator('[data-target-preview="spread"]').count(),3);assert.equal(await page.locator('[data-target-line]').count(),3);await page.screenshot({path:'work/cinematic-spread-targets.png'});
  await page.locator('[data-move-id="earthquake"]').click();await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('[data-move-id="hydropump"]').click();
  assert.equal(await page.locator('.actor-target-button').count(),2);await page.getByRole('button',{name:'갸라도스에게 기술 사용',exact:true}).click();
  await page.getByRole('button',{name:'행동 결정',exact:true}).click();await skip();report.checks.push('Double spread includes ally; single target selection commits real actions');
  }

  for(const format of ['singles','doubles'])for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:360,height:640}]){
    await page.setViewportSize(viewport);await setup('charizard','flamethrower',format);await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.waitForTimeout(250);
    const layout=await page.evaluate(()=>{
      const panels=[...document.querySelectorAll('.battle-status-plate,.battle-action-box,.battle-message-box')].map(node=>({name:node.className,rect:node.getBoundingClientRect()}));
      const occlusions=[];
      for(const sprite of document.querySelectorAll('.scene-actor .sprite-crop')){const box=sprite.getBoundingClientRect();for(const panel of panels){const w=Math.min(box.right,panel.rect.right)-Math.max(box.left,panel.rect.left),h=Math.min(box.bottom,panel.rect.bottom)-Math.max(box.top,panel.rect.top);if(w>2&&h>2)occlusions.push({uid:sprite.closest('.scene-actor').dataset.uid,panel:panel.name,w,h});}}
      return {overflow:document.documentElement.scrollWidth-innerWidth,occlusions,moveFont:parseFloat(getComputedStyle(document.querySelector('.move-power')).fontSize)};
    });assert(layout.overflow<=1);assert(layout.moveFont>=10);assert.deepEqual(layout.occlusions,[],format+' '+viewport.width+'x'+viewport.height);report.layouts.push({format,...viewport,...layout});
    if(viewport.width===390)await page.screenshot({path:'work/cinematic-'+format+'-mobile.png'});
  }

  await page.setViewportSize({width:1440,height:900});await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('button',{name:'설정',exact:true}).click();
  const sampleRate=8000,samples=1600,wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(36+samples*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i/sampleRate*440*Math.PI*2)*2500),44+i*2);
  await page.getByLabel('효과음 파일 가져오기').setInputFiles({name:'type-electric.wav',mimeType:'audio/wav',buffer:wav});await page.getByText('1개 음원을 실제 디코딩해 연결했습니다.',{exact:true}).waitFor();
  await page.evaluate(()=>window.audioStarts=[]);await page.getByRole('button',{name:'전기 효과음 듣기',exact:true}).click();
  const played=await page.evaluate(()=>window.audioStarts);assert.equal(played.filter(sound=>sound.kind==='buffer').length,1);assert.equal(played.filter(sound=>sound.kind==='tone').length,0);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByText(/이 브라우저에 1개 저장됨/).waitFor();
  await page.getByRole('button',{name:'가져온 효과음 지우기',exact:true}).click();await page.getByText(/기본 합성음을 사용합니다/).waitFor();report.checks.push('Real WAV decode → file playback priority → IndexedDB reload → restore synthesis');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.imageErrors,[]);report.passed=true;console.log('BROWSER_CINEMATIC_OK '+JSON.stringify(report));
}catch(error){report.error=String(error);await page?.screenshot({path:'work/cinematic-failure.png'}).catch(()=>{});throw error;}
finally{writeFileSync(process.argv.includes('--layout-only')?'work/cinematic-layout-report.json':'work/cinematic-browser-report.json',JSON.stringify(report,null,2));await browser?.close();await server.close();}
