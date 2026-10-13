import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
import { chromium } from 'playwright-core';
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if(!executablePath)throw Error('Actual image decoding requires Chrome. Set CHROME_PATH.');
const images={},missing=[],invalid=[];
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 for(const pokemon of sandbox.exports.roster)for(const facing of ['front','back']){
  const relative=`${facing}/${pokemon.spriteId??pokemon.nationalDex}.png`,file=path.join('public/sprites',relative);
  if(!fs.existsSync(file)){missing.push(relative);continue;}
  const bytes=fs.readFileSync(file);
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.length>2_000_000){invalid.push({path:relative,reason:'Invalid PNG bytes or file size'});continue;}
  const result=await page.evaluate(async encoded=>{
   try{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const valid=bitmap.width>0&&bitmap.height>0&&bitmap.width<=2048&&bitmap.height<=2048;bitmap.close();return {valid,reason:valid?null:'Invalid dimensions'};
   }catch(error){return {valid:false,reason:error.message};}
  },bytes.toString('base64'));
  if(!result.valid){invalid.push({path:relative,reason:result.reason});continue;}
  images[relative.slice(0,-4)]=`/sprites/${relative}`;
 }
}finally{await browser.close();}
if(process.argv.includes('--write-manifest'))fs.writeFileSync('public/sprites/manifest.json',JSON.stringify({version:1,images},null,2));
const report={expected:sandbox.exports.roster.length*2,valid:Object.keys(images).length,front:Object.keys(images).filter(key=>key.startsWith('front/')).length,back:Object.keys(images).filter(key=>key.startsWith('back/')).length,missing,invalid,status:missing.length||invalid.length?'INCOMPLETE':'DECODED_FILES_NEED_IDENTITY_AND_RIGHTS_AUDIT'};
fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/sprite-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({expected:report.expected,valid:report.valid,front:report.front,back:report.back,missing:missing.length,invalid:invalid.length,status:report.status},null,2));
if(missing.length||invalid.length)process.exitCode=1;
