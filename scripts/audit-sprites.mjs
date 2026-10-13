import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const roster=sandbox.exports.roster;
const supplementPilot=process.argv.includes('--supplement-pilot');
const isPilot=process.argv.includes('--pilot')||supplementPilot;
const pilot=supplementPilot?['flareon','incineroar','rillaboom','kyurem','gholdengo']:['flareon','incineroar','rillaboom','kyurem','gholdengo'];
const chosen=isPilot?pilot.map(id=>roster.find(row=>row.id===id)):roster;
const attribution=JSON.parse(fs.readFileSync('public/sprites/attribution.json','utf8'));
const browserPath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
const server=await createServer({server:{host:'127.0.0.1',port:5183,strictPort:true},logLevel:'error'});
let browser;
fs.mkdirSync('outputs',{recursive:true});fs.mkdirSync('work',{recursive:true});
try{
 await server.listen();browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5183/',{waitUntil:'networkidle'});
 const runtime=await page.evaluate(async()=>{const sprites=await import('/src/presentation/sprites.ts');await sprites.initializeSprites();return sprites.spriteDiagnosticReport();});
 await page.getByRole('button',{name:'포켓몬 목록',exact:true}).click();
 const expectedFront=runtime.entries.filter(row=>row.facing==='front'&&row.verified).length;
 await page.waitForFunction(expected=>{const images=[...document.querySelectorAll('.dex-card .pokemon-sprite')];return images.length===expected&&images.every(image=>image.complete&&image.naturalWidth>0);},expectedFront);
 const rosterUi=await page.evaluate(()=>({cards:document.querySelectorAll('.dex-card').length,realImages:document.querySelectorAll('.dex-card .pokemon-sprite').length,fallbackImages:document.querySelectorAll('.dex-card .sprite-fallback').length,
  identityMismatches:[...document.querySelectorAll('.dex-card')].filter(card=>{const image=card.querySelector('.pokemon-sprite'),dex=Number(card.querySelector('.dex-id')?.textContent.replace('#',''));return image&&!image.getAttribute('src')?.endsWith(`/front/${dex}.png`);}).length}));
 if(rosterUi.cards!==roster.length||rosterUi.realImages!==expectedFront||rosterUi.identityMismatches)throw Error(`Roster image rendering mismatch: ${JSON.stringify(rosterUi)}`);
 if(!isPilot)await page.screenshot({path:'outputs/sprite-dex-screen.png'});
 const checks=[];
 const queue=chosen.flatMap(p=>['front','back'].map(facing=>({pokemon:p,facing})));
 await Promise.all(Array.from({length:6},async()=>{
  while(queue.length){
   const {pokemon,facing}=queue.shift();const relative=`${facing}/${pokemon.nationalDex}.png`,file=`public/sprites/${relative}`;
   const exists=fs.existsSync(file),expectedHash=exists?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
   const http=await page.evaluate(async path=>{
    const response=await fetch(path,{cache:'no-store'}),bytes=new Uint8Array(await response.arrayBuffer());
    const result={status:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length,magic:[...bytes.slice(0,8)],decoded:false};
    if(response.ok&&result.contentType?.startsWith('image/png')&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'){
     try{const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));result.width=bitmap.width;result.height=bitmap.height;result.decoded=bitmap.width>0&&bitmap.height>0;bitmap.close();
      result.sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
     }catch(error){result.error=error.message;}
    }return result;
   },`/sprites/${relative}`);
   const credit=attribution.images.find(row=>row.speciesId===pokemon.id&&row.nationalDex===pokemon.nationalDex);
   const identity=!!credit&&credit.name===pokemon.name&&credit.englishName===pokemon.englishName&&credit.images[facing]?.sha256===expectedHash;
   const success=exists&&http.status===200&&http.decoded&&http.sha256===expectedHash&&identity;
   checks.push({speciesId:pokemon.id,name:pokemon.name,nationalDex:pokemon.nationalDex,facing,path:file,fileExists:exists,http,
    identityVerified:identity,source:credit?.images[facing]?.source??credit?.source??null,success,failure:success?null:!exists?'LOCAL_FILE_MISSING':!identity?'IDENTITY_OR_PROVENANCE_MISMATCH':'HTTP_OR_IMAGE_DECODE_FAILURE'});
  }
 }));
 checks.sort((a,b)=>a.nationalDex-b.nationalDex||a.facing.localeCompare(b.facing));
 const remote=[];
 // Known source addresses, no image search. Diagnostic only; official artwork is not bundled.
 if(process.argv.includes('--pilot'))for(const dex of chosen.map(p=>p.nationalDex))for(const facing of ['front','back']){
  const url=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${facing==='back'?'back/':''}${dex}.png`;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer());
   const decoded=await page.evaluate(async encoded=>{try{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const out={success:true,width:image.width,height:image.height};image.close();return out;}catch(error){return {success:false,error:error.message};}},bytes.toString('base64'));
   remote.push({nationalDex:dex,facing,url,status:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length,...decoded,bundled:false,reason:'HTTP availability is separate from permission to redistribute official artwork'});
  }catch(error){remote.push({nationalDex:dex,facing,url,success:false,error:error.message,bundled:false});}
 }
 const valid=chosen.filter(p=>checks.some(row=>row.speciesId===p.id&&row.success));
 await page.setContent(`<style>body{margin:0;padding:20px;background:#182724;color:#d8eee3;font:14px sans-serif}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.tile{background:#274037;padding:10px;text-align:center}.images{display:flex;justify-content:center;height:100px;align-items:center}img{width:80px;height:90px;object-fit:contain;image-rendering:pixelated}small{display:block;font:10px monospace;color:#a9cabd}</style><h1>${chosen.length===5?'Pilot 5':'All verified Pokémon sprites'} · FRONT / BACK</h1><div class="grid">${valid.map(p=>`<div class="tile"><b>#${p.nationalDex} ${p.name}</b><div class="images"><img src="http://127.0.0.1:5183/sprites/front/${p.nationalDex}.png"><img src="http://127.0.0.1:5183/sprites/back/${p.nationalDex}.png"></div><small>${p.id} · front / back</small></div>`).join('')}</div>`);
 await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
 const sheet=`outputs/sprites-${supplementPilot?'supplement-pilot':isPilot?'pilot':'verified'}.png`;await page.screenshot({path:sheet,fullPage:true});
 const report={checkedAt:new Date().toISOString(),phase:supplementPilot?'supplementPilot5':isPilot?'pilot5':`all${roster.length}`,uniqueIds:new Set(roster.map(p=>p.id)).size,uniqueNationalDex:new Set(roster.map(p=>p.nationalDex)).size,
  expected:chosen.length*2,success:checks.filter(row=>row.success).length,failed:checks.filter(row=>!row.success).length,
  frontSuccess:checks.filter(row=>row.success&&row.facing==='front').length,backSuccess:checks.filter(row=>row.success&&row.facing==='back').length,
  remoteSuccess:remote.filter(row=>row.success&&row.status===200).length,remoteFailed:remote.filter(row=>!row.success||row.status!==200).length,
  browserErrors:errors,runtimeSummary:{success:runtime.success,failed:runtime.failed,issues:runtime.issues},rosterUi,checks,remote,contactSheet:sheet};
 fs.writeFileSync(`outputs/sprite-${supplementPilot?'supplement-pilot-local':isPilot?'pilot':'audit'}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({phase:report.phase,expected:report.expected,success:report.success,failed:report.failed,front:report.frontSuccess,back:report.backSuccess,remoteSuccess:report.remoteSuccess,remoteFailed:report.remoteFailed,browserErrors:errors}));
 if(errors.length||(isPilot||process.argv.includes('--require-complete'))&&report.failed)process.exitCode=1;
}finally{await browser?.close();await server.close();}
