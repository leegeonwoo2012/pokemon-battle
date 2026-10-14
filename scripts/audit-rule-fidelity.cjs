// Compare supported core parameters to the pinned source-derived data. This is not
// proof that all custom callback effects and cross-generation interactions match.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(filename){
  filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename);
  const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>load(path.resolve(path.dirname(filename),id+'.ts')),structuredClone},{filename});return exports;
}
const {moves}=load('src/data/index.ts'),{championMoves}=load('src/data/champion-moves.generated.ts');
const fields=['type','category','power','accuracy','pp','priority','contact','sound','powder','bite','slicing','pulse','punch','bullet'];
const differences=[];let compared=0;
for(const [id,source] of Object.entries(championMoves)){
  const actual=moves[id];if(!actual)continue;compared++;
  for(const field of fields){if(field==='power'&&['return','frustration'].includes(id))continue;const expected=source[field]??false,value=actual[field]??false;if(expected!==value)differences.push({id,name:actual.name,field,source:expected,game:value});}
}
const report={source:'Pinned Showdown M-C-derived move metadata, commit 942cda71',comparedMoves:compared,coreFieldDifferences:differences,explicitCustomRules:['Return/Frustration friendship-based power','Life Orb costs 1/8 maximum HP','Rampage lasts 2–5 turns','Make It Rain lowers Special Attack by 2 stages','Mixed Mega/Tera/Z/Dynamax rules'],limitations:'This audit does not validate arbitrary move callbacks, every ability interaction, or official Champions equivalence.'};
fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/rule-fidelity-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({comparedMoves:compared,differenceCount:differences.length,differences},null,2));
