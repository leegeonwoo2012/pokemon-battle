import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {selectTeamPreview} from './browser-preview.mjs';

const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true},logLevel:'error'});
mkdirSync('work',{recursive:true});
let browser;
try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'싱글 배틀 시작',exact:true}).click();await selectTeamPreview(page);
  await page.evaluate(async()=>{
    const client=await import('/node_modules/.vite/deps/react-dom_client.js');
    const react=await import('/node_modules/.vite/deps/react.js');
    const {createRoot}=client.default??client,{createElement:h}=react.default??react;
    const {SceneActor}=await import('/src/components/BattleVisuals.tsx');
    const {WeatherEffects}=await import('/src/components/WeatherEffects.tsx');
    const {createBattle,runTurnWithEvents}=await import('/src/engine/battle.ts');
    const {createSet}=await import('/src/team/index.ts');
    const {animateBattleEvent,resetBattleVisuals}=await import('/src/presentation/animate.ts');
    const scene=document.querySelector('.battle-scene').cloneNode(true);
    document.querySelector('#root').style.display='none';
    const host=document.createElement('main');host.id='feedback-preview';host.className='battle-page';host.append(scene);document.body.append(host);
    scene.querySelectorAll('.weather-particles,.weather-lighting').forEach(el=>el.remove());
    const roots={};
    for(const side of ['player','cpu']){
      const formation=scene.querySelector(side==='player'?'.formation-player':'.formation-foe');
      formation.replaceChildren();roots[side]=createRoot(formation);
    }
    const weatherHost=document.createElement('div');weatherHost.style.cssText='position:absolute;inset:0;pointer-events:none';
    scene.querySelector('.battle-camera').append(weatherHost);const weatherRoot=createRoot(weatherHost);
    let controller;
    window.feedbackSeen=[];
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.classList.contains('battle-vfx'))window.feedbackSeen.push(node.className);}).observe(scene,{subtree:true,childList:true});
    window.prepareFeedback=async({moveId='flamethrower',weather,field,status,critical=false,low=false}={})=>{
      controller?.abort();resetBattleVisuals(scene);controller=new AbortController();window.feedbackSeen=[];
      const speciesId={flamethrower:'charizard',surf:'blastoise',thunderbolt:'raichu',icebeam:'lapras',closecombat:'lucario',rockslide:'tyranitar'}[moveId];
      const ownSet=createSet(speciesId);
      ownSet.moves=[...new Set([moveId,...ownSet.moves])].slice(0,4);
      const initial=createBattle({format:'singles',seed:11,playerTeam:[ownSet],cpuTeam:[{...createSet('snorlax'),moves:['curse','bodyslam','rest','protect']}]});
      if(weather)initial.weather={id:weather,turns:5};else initial.weather=null;
      if(field)initial.field={id:field,turns:5};else initial.field=null;
      initial.sides.player.team[0].set.abilityId='noguard';
      initial.sides.cpu.team[0].set.abilityId='noguard';
      initial.sides.cpu.team[0].maxHp=initial.sides.cpu.team[0].hp=2000;
      const result=runTurnWithEvents(initial,[{kind:'move',slot:0,moveId}],[{kind:'move',slot:0,moveId:'curse'}]);
      const hit=result.events.find(e=>e.kind==='damage'&&e.moveId===moveId&&e.targetUid===initial.sides.cpu.team[0].uid);
      if(!hit)throw Error('No real damage event for '+moveId);
      hit.critical=critical;
      const own=hit.snapshot.sides.player.team[0],foe=hit.snapshot.sides.cpu.team[0];
      own.types=['rock'];own.status=status??null;if(low)own.hp=1;
      scene.dataset.weather=weather??'';scene.dataset.field=field??'';scene.dataset.playbackRate='1';
      if(low)scene.dataset.danger='true';else delete scene.dataset.danger;
      roots.player.render(h(SceneActor,{pokemon:own,side:'player',slot:0,event:hit}));
      roots.cpu.render(h(SceneActor,{pokemon:foe,side:'cpu',slot:0,event:hit}));
      weatherRoot.render(h(WeatherEffects,{weather,reducedMotion:false,event:hit}));
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      window.feedbackEvent=hit;
    };
    window.playFeedback=(reduced=false,miss=false)=>{
      const event=miss?{...window.feedbackEvent,kind:'miss',critical:false}:window.feedbackEvent;
      window.feedbackPlayback=animateBattleEvent(scene,event,controller.signal,reduced);
    };
    window.finishFeedback=()=>window.feedbackPlayback;
    window.abortFeedback=()=>controller.abort();
  });
  const examples=[
    {moveId:'flamethrower',weather:'sun',status:'burn',accent:'fire-bloom'},
    {moveId:'surf',weather:'rain',field:'electric',status:'poison',accent:'lens-drop'},
    {moveId:'thunderbolt',status:'paralysis',accent:'electric-bolt'},
    {moveId:'icebeam',weather:'snow',status:'freeze',accent:'ice-crystal'},
    {moveId:'closecombat',field:'psychic',accent:'ground-crack'},
    {moveId:'rockslide',weather:'sand',low:true,accent:'shockwave'},
  ];
  for(const example of examples){
    await page.evaluate(example=>window.prepareFeedback(example),example);
    if(example.field){
      const selector=example.field==='psychic'?'.field-psychic-wave':'.field-electric-reflection';
      assert(await page.locator('#feedback-preview '+selector).first().evaluate(el=>getComputedStyle(el).display!=='none'));
    }
    await page.evaluate(()=>window.playFeedback());
    await page.waitForTimeout(170);
    assert(await page.locator(`#feedback-preview .accent-${example.accent}`).count()>0,example.moveId);
    await page.screenshot({path:`work/feedback-${example.moveId}.png`});
    await page.evaluate(()=>window.finishFeedback());
    assert.equal(await page.locator('#feedback-preview .battle-vfx').count(),0);
  }
  await page.evaluate(()=>window.prepareFeedback({critical:true,weather:'snow',field:'psychic'}));
  await page.evaluate(()=>window.playFeedback());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-critical-impact=true]').count(),1);
  assert(await page.locator('.impact-critical-ring').count()>0);
  const slowed=await page.evaluate(()=>[...document.querySelectorAll('#feedback-preview .field-psychic-wave')].flatMap(el=>el.getAnimations()).some(animation=>animation.playbackRate<1));
  assert(slowed,'critical did not slow ambient animation');
  await page.evaluate(()=>window.abortFeedback());await page.evaluate(()=>window.finishFeedback());
  // updatePlaybackRate preserves the animation's phase and takes effect on the
  // next rendering tick, including when an impact is skipped mid-frame.
  await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  assert.equal(await page.locator('#feedback-preview .battle-vfx').count(),0);
  assert.equal(await page.locator('[data-critical-impact]').count(),0);
  assert(await page.evaluate(()=>[...document.querySelectorAll('#feedback-preview .field-psychic-wave')].flatMap(el=>el.getAnimations()).every(animation=>animation.playbackRate===1)));
  await page.evaluate(()=>window.prepareFeedback({field:'electric'}));
  assert(await page.locator('#feedback-preview .field-electric-reflection').first().evaluate(el=>getComputedStyle(el).display==='none'));
  await page.evaluate(()=>window.prepareFeedback());
  await page.evaluate(()=>window.playFeedback(false,true));await page.waitForTimeout(100);
  assert.equal(await page.locator('.miss-afterimage').count(),1);
  assert.equal(await page.locator('.elemental-accent').count(),0);
  await page.evaluate(()=>window.finishFeedback());
  await page.evaluate(()=>window.prepareFeedback({critical:true}));
  await page.evaluate(()=>window.playFeedback(true));await page.evaluate(()=>window.finishFeedback());
  assert.equal(await page.locator('#feedback-preview .battle-vfx').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.playFeedback());await page.evaluate(()=>window.finishFeedback());
  assert.equal(await page.locator('#feedback-preview .battle-vfx').count(),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.prepareFeedback({moveId:'surf',weather:'rain',field:'electric',status:'poison',low:true}));
  await page.waitForTimeout(500);await page.screenshot({path:'work/feedback-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({types:6,weatherField:true,criticalSlowMotion:true,abortCleanup:true,miss:true,reducedMotion:true,mobile:true,errors}));
}finally{await browser?.close();await server.close();}
