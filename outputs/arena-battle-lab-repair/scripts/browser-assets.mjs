import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const executablePath=process.env.CHROME_PATH||['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const server=await createServer({server:{host:'127.0.0.1',port:5179,strictPort:true},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:800}});
 // An original diagnostic image, not a Pokémon picture and never packaged as a game asset.
 await page.setContent('<body style="margin:0"><div style="width:96px;height:96px;background:#e6f9f1;color:#135845;display:grid;place-items:center;font:16px sans-serif">TEST ONLY</div></body>');
 const png=await page.locator('div').screenshot();
 for(const directory of ['work/sprite-fixture/front','work/sprite-fixture/back','work/invalid-fixture/front'])mkdirSync(directory,{recursive:true});
 for(const file of ['front/25.png','back/25.png','front/248.png'])writeFileSync('work/sprite-fixture/'+file,png);
 writeFileSync('work/invalid-fixture/front/25.png','not a PNG');
 await page.goto('http://127.0.0.1:5179/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'설정',exact:true}).click();
 await page.getByLabel('스프라이트 폴더 가져오기').setInputFiles(resolve('work/invalid-fixture'));
 await page.getByText('25.png: 올바른 PNG가 아닙니다.').waitFor();
 await page.getByLabel('스프라이트 폴더 가져오기').setInputFiles(resolve('work/sprite-fixture'));
 await page.getByText('검증한 PNG 3개를 저장했습니다.').waitFor();
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('button',{name:/싱글 배틀 시작/}).click();
 const front=page.getByRole('img',{name:'마기라스 정면 스프라이트'}).locator('img');
 const back=page.getByRole('img',{name:'피카츄 후면 스프라이트'}).locator('img');
 await page.waitForFunction(()=>[...document.querySelectorAll('.scene-actor img')].length===2&&[...document.querySelectorAll('.scene-actor img')].every(image=>image.complete&&image.naturalWidth===96));
 const oldBack=await back.getAttribute('src');
 await back.dispatchEvent('error',{bubbles:false});await page.waitForFunction(old=>document.querySelector('.formation-player img')?.src!==old,oldBack);
 assert.equal(await back.evaluate(image=>image.naturalWidth),96);
 await front.dispatchEvent('error',{bubbles:false});await page.getByRole('img',{name:'마기라스 정면 이미지 미완성'}).waitFor();
 console.log('ASSET_LOADER_OK: validated PNG import, IndexedDB reload, matching Dex routes, back-to-front fallback, terminal error state. TEST FIXTURES ONLY; 0 real Pokémon sprites verified.');
}finally{await browser?.close();await server.close();}
