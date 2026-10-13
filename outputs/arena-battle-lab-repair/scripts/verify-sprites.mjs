import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const images={},missing=[],invalid=[];
for(const pokemon of sandbox.exports.roster)for(const facing of ['front','back']){
 const relative=`${facing}/${pokemon.nationalDex}.png`,file=path.join('public/sprites',relative);
 if(!fs.existsSync(file)){missing.push(relative);continue;}
 const bytes=fs.readFileSync(file);
 if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)===0||bytes.readUInt32BE(20)===0){invalid.push(relative);continue;}
 images[relative.slice(0,-4)]=`/sprites/${relative}`;
}
if(process.argv.includes('--write-manifest'))fs.writeFileSync('public/sprites/manifest.json',JSON.stringify({version:1,images},null,2));
const report={expected:360,valid:Object.keys(images).length,front:Object.keys(images).filter(key=>key.startsWith('front/')).length,back:Object.keys(images).filter(key=>key.startsWith('back/')).length,missing,invalid,status:missing.length||invalid.length?'INCOMPLETE':'FILES_VALID_NEEDS_VISUAL_AND_RIGHTS_REVIEW'};
fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/sprite-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({expected:report.expected,valid:report.valid,front:report.front,back:report.back,missing:missing.length,invalid:invalid.length,status:report.status},null,2));
if(missing.length||invalid.length)process.exitCode=1;
