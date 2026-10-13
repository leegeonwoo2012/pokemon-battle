import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw Error('Chrome 또는 Edge가 필요합니다.');
mkdirSync('work',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5183,strictPort:true},logLevel:'error'});
let browser;const report={flows:[],errors:[],imageErrors:[]};
try {
  await server.listen();browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(()=>{Date.now=()=>123456789;});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/sprites/')&&!r.ok())report.imageErrors.push(r.url());});
  const origin='http://127.0.0.1:5183';
  await page.goto(origin,{waitUntil:'networkidle'});
  const formIds=Object.keys(JSON.parse(readFileSync('public/sprites/forms/manifest.json','utf8')));
  const decoded=await page.evaluate(async ids=>Promise.all(ids.flatMap(id=>['front','back'].map(async facing=>{
    const image=new Image();image.src=`/sprites/forms/${id}-${facing}.png`;
    try { await image.decode(); return image.naturalWidth>0&&image.naturalHeight>0; } catch { return false; }
  }))),formIds);
  const requestedFormIds=Object.keys(JSON.parse(readFileSync('src/data/form-slugs.generated.json','utf8')));
  assert.equal(formIds.length,requestedFormIds.length);assert(decoded.every(Boolean));report.formImagesDecoded=decoded.length;
  async function setup(kind,format='singles',reduced=false) {
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(async({kind,reduced})=>{
      const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
      const lead=kind==='dynamax'?{...createSet('blastoise'),moves:['surf','icebeam','raindance','protect'],gigantamax:true}:{...createSet('charizard'),moves:['flamethrower','airslash','roost','protect'],itemId:kind==='mega'?'charizarditex':kind==='z'?'firiumz':'none',teraType:'water'};
      const team=[lead,createSet('raichu'),createSet(kind==='dynamax'?'charizard':'blastoise')];
      localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team}));localStorage.setItem('arena-reduced-motion',String(reduced));
    },{kind,reduced});
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:format==='singles'?'싱글 배틀 시작':'더블 배틀',exact:true}).click();
    await page.locator('.battle-scene').waitFor();
  }
  async function choose(kind,move=/화염방사/) {
    const gimmickButton=page.locator(`[data-gimmick="${kind}"]`);
    if(await gimmickButton.getAttribute('aria-pressed')!=='true') await gimmickButton.click();
    const button=page.locator('.move-actions>button').filter({hasText:move}).first();await button.click();
    if(await page.locator('.target-actions').count())await page.locator('.target-actions>button:not(.action-back)').first().click();
  }
  async function run() {
    await page.getByRole('button',{name:/행동 결정/}).click();
    await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',{},{timeout:60000});
    await replacement();
  }
  async function replacement() {
    if(await page.locator('.battle-action-box').getAttribute('data-menu')!=='party')return;
    assert.match(await page.locator('.battle-message-box').innerText(),/다음으로 출전/);
    while(await page.locator('.battle-action-box').getAttribute('data-menu')==='party') await page.locator('.party-actions>button:not(:disabled):not(.action-back)').first().click();
    await page.getByRole('button',{name:/행동 결정/}).click();
    await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',{},{timeout:60000});
  }
  for(const kind of ['mega','tera','z','dynamax']) {
    await setup(kind);
    if(kind==='tera') {await page.locator('[data-gimmick="tera"]').click();assert.equal(await page.locator('[aria-label="배틀 테라 타입"] option').count(),19);await page.locator('[aria-label="배틀 테라 타입"]').selectOption('psychic');}
    await choose(kind,kind==='z'?/다이내믹풀플레임/:kind==='mega'?/^방어/:kind==='dynamax'?/다이월/:/화염방사/);
    if(kind==='tera') report.teraSelectionBeforeTurn={button:await page.locator('[data-gimmick="tera"]').getAttribute('aria-pressed'),type:await page.locator('[aria-label="배틀 테라 타입"]').inputValue(),pending:await page.locator('.action-footer').innerText()};
    await page.getByRole('button',{name:/행동 결정/}).click();
    await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='true');
    if(kind==='mega'||kind==='dynamax') {
      await page.locator('.stadium-transform-spotlight').waitFor({timeout:30000});
      await page.screenshot({path:`work/gimmick-${kind}-reveal.png`,fullPage:true});
    }
    assert(await page.locator('.battle-action-box').evaluate(node=>node.disabled));
    assert(await page.locator('.game-choice-fight').isDisabled());
    assert.equal(await page.locator('.game-choice-fight').isVisible(),false);
    await page.waitForFunction(()=>document.querySelector('.battle-scene')?.getAttribute('aria-busy')==='false',{},{timeout:60000});
    await replacement();
    assert.match(await page.locator('.gimmick-controls').innerText(),/사용 완료/);
    assert.equal(await page.locator('.gimmick-controls button:not(:disabled)').count(),0);
    await page.screenshot({path:`work/gimmick-${kind}.png`,fullPage:true});
    if(kind!=='z') assert.equal(await page.locator(`.formation-player [data-transformation="${kind}"]`).count(),1);
    if(kind==='mega'||kind==='dynamax') assert.equal(await page.locator('.formation-player [data-form-sprite="true"]').count(),1);
    if(kind==='tera') assert.equal(await page.locator('.formation-player [data-transformation="tera"]').getAttribute('class').then(value=>value.includes('tera-psychic')),true);
    assert(await page.locator('.formation-player .sprite-art img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
    await page.screenshot({path:`work/gimmick-${kind}.png`,fullPage:true});
    report.flows.push({kind,format:'singles',inputLock:true,spriteLoaded:true,...(kind==='tera'?{selectedType:'psychic',availableTypes:19}:{})});
    if(kind==='dynamax') {
      for(let i=0;i<2;i++){await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('.move-actions>button').filter({hasText:'다이월'}).first().click();await run();}
      assert.equal(await page.locator('.formation-player [data-transformation="dynamax"]').count(),0);
      report.maxThreeTurns=true;
    }
  }
  for(const kind of ['mega','z','dynamax']) {
    await setup(kind,'doubles',true);await choose(kind,kind==='z'?/다이내믹풀플레임/:kind==='mega'?/^방어/:/다이월/);
    assert.equal(await page.locator('.gimmick-controls button:not(:disabled)').count(),0);
    await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('.move-actions>button').filter({hasText:'방어'}).click();await run();
    assert.match(await page.locator('.gimmick-controls').innerText(),/사용 완료/);
    report.flows.push({kind,format:'doubles',sharedResource:true});
  }
  await setup('tera','doubles',true);await choose('tera',/^방어/);
  assert.equal(await page.locator('.gimmick-controls button:not(:disabled)').count(),0);
  await page.getByRole('button',{name:'싸운다',exact:true}).click();await page.locator('.move-actions>button').filter({hasText:'방어'}).click();await run();
  assert.equal(await page.locator('.scene-actor').count(),4);assert.equal(await page.locator('.formation-player [data-transformation="tera"]').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
  await page.screenshot({path:'work/gimmick-double-mobile.png',fullPage:true});
  report.flows.push({kind:'tera',format:'doubles',sharedResource:true,mobile:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:/나가기/}).click();await page.getByRole('button',{name:'팀 편성',exact:true}).click();
  await page.getByRole('button',{name:'메가리자몽 X 메가스톤 장착'}).click();
  assert.equal(await page.getByLabel('지닌 도구').inputValue(),'charizarditex');
  await page.locator('.team-slot').nth(1).click();
  await page.getByRole('button',{name:'전기 Z크리스탈 장착'}).click();
  assert.equal(await page.getByLabel('지닌 도구').inputValue(),'electriumz');
  await page.locator('.team-slot').first().click();
  await page.getByLabel('테라 타입',{exact:true}).selectOption('fairy');await page.getByLabel('거다이맥스',{exact:true}).check();await page.getByRole('button',{name:'팀 저장',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'팀 편성',exact:true}).click();
  assert.equal(await page.getByLabel('테라 타입',{exact:true}).inputValue(),'fairy');assert(await page.getByLabel('거다이맥스',{exact:true}).isChecked());report.teamSaved=true;
  for(const [stone,form] of [['raichunitex','raichumegax'],['raichunitey','raichumegay']]) {
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.evaluate(async stone=>{
      const {createSet,TEAM_STORAGE_KEY}=await import('/src/team/index.ts');
      localStorage.setItem(TEAM_STORAGE_KEY,JSON.stringify({version:1,team:[{...createSet('raichu'),itemId:stone}]}));
      localStorage.setItem('arena-reduced-motion','true');
    },stone);
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'싱글 배틀 시작',exact:true}).click();
    await page.locator('[data-gimmick="mega"]').click();
    await page.locator('.move-actions>button').filter({hasText:/방어/}).first().click();
    await run();
    await page.waitForFunction(form=>{const image=document.querySelector(`.formation-player [data-form-sprite="true"] img[src*="${form}-back.png"]`);return image?.complete&&image?.naturalWidth>0;},form);
    report.flows.push({kind:'mega',form,frontAndBackDecoded:true,battleBackLoaded:true});
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.imageErrors,[]);
  writeFileSync('work/gimmick-browser-report.json',JSON.stringify(report,null,2));console.log('GIMMICK_BROWSER_OK '+JSON.stringify(report));
} finally {await browser?.close();await server.close();}
