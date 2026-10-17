import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync,mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!executablePath)throw Error('Chrome 또는 Edge가 필요합니다.');
mkdirSync('work',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5184,strictPort:true},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:720}});
  await page.goto('http://127.0.0.1:5184/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    document.body.innerHTML='<div class="battle-scene" data-playback-rate="1" style="position:relative;width:100vw;height:100vh;overflow:hidden;background:radial-gradient(ellipse at center,#273663,#0e142b)"><div class="battle-camera" style="position:absolute;inset:0"><div class="scene-actor actor-player" data-uid="player-0" style="position:absolute;left:36%;top:34%;width:300px;height:300px"><div class="sprite-art" style="width:100%;height:100%"><img style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated" src="/sprites/forms/charizardmegax-back.png"></div></div></div></div>';
    const image=document.querySelector('img');await image.decode();
    const {animateBattleEvent}=await import('/src/presentation/animate.ts');
    const event={kind:'gimmick-transform',gimmick:'mega',actorUid:'player-0',snapshot:{sides:{player:{active:[0],team:[{uid:'player-0',hp:100,maxHp:100,transformation:{kind:'mega',formId:'charizardmegax'}}]},cpu:{active:[],team:[]}}}};
    window.megaAnimation=animateBattleEvent(document.querySelector('.battle-scene'),event,new AbortController().signal,false);
  });
  await page.locator('.vfx-move-mega-seal').waitFor();
  assert.equal(await page.locator('.vfx-move-mega-shard').count(),10);
  assert.equal(await page.locator('.battle-scene').getAttribute('data-gimmick'),'mega');
  await page.waitForTimeout(700);
  await page.screenshot({path:'work/mega-reveal-new.png'});
  await page.evaluate(()=>window.megaAnimation);
  assert.equal(await page.locator('.battle-vfx').count(),0);
  assert.equal(await page.locator('.battle-scene').getAttribute('data-gimmick'),null);
  console.log('MEGA_REVEAL_OK');
}finally{await browser?.close();await server.close();}
