// Run the actual TypeScript engine on Node; no second set of battle rules.
// Compiler dependency is already installed for this project. Only trusted local source is loaded.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file) {
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  if(file.endsWith('.json')){module.exports=JSON.parse(fs.readFileSync(file,'utf8'));return module.exports;}
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire=id=>{
    if(!id.startsWith('.'))return require(id);
    const base=path.resolve(path.dirname(file),id),target=[base,base+'.ts',base+'.json',path.join(base,'index.ts')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
    if(!target)throw Error(`Unresolved engine dependency: ${id}`);
    return load(target);
  };
  new Function('require','module','exports',code)(localRequire,module,module.exports);
  return module.exports;
}
module.exports={loadEngine:()=>load(path.join(__dirname,'../src/engine/battle.ts')),loadChoices:()=>load(path.join(__dirname,'../src/engine/choices.ts')),loadGimmicks:()=>load(path.join(__dirname,'../src/engine/gimmicks.ts'))};
