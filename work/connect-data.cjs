const fs=require('node:fs');
const p='src/data/index.ts';let s=fs.readFileSync(p,'utf8');
s="import { roster, importedAbilities } from './roster.generated';\n"+s;
s=s.replace(/\/\*\*[\s\S]*?\*\//,'/** Supported engine rules with a generated, source-verified 180-species roster. See THIRD_PARTY_NOTICES.md. */');
const start=s.indexOf('const nationalDexById'); const end=s.indexOf('export const starterTeam');
s=s.slice(0,start)+"export const species: Record<string, Species> = Object.fromEntries(roster.map(entry => [entry.id, entry]));\nObject.assign(abilities, importedAbilities);\n\n"+s.slice(end);
fs.writeFileSync(p,s);
