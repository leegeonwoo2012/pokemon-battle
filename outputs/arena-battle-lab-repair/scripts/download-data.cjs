const fs = require('node:fs');
(async () => {
 fs.mkdirSync('work/upstream',{recursive:true});
 const requests = {
 'pokedex.ts':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts',
 'learnsets.ts':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts',
 'abilities.ts':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/abilities.ts',
 'showdown-LICENSE':'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/LICENSE',
 'pokemon_species_names.csv':'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv',
 'ability_names.csv':'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv',
 'abilities.csv':'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/abilities.csv',
 'pokeapi-LICENSE':'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/LICENSE.md',
 };
 await Promise.all(Object.entries(requests).map(async ([name,url])=> { const r=await fetch(url); if(!r.ok)throw Error(`${name}: ${r.status}`); fs.writeFileSync(`work/upstream/${name}`,await r.text()); }));
 console.log('Upstream sources downloaded');
})().catch(error=>{console.error(error);process.exitCode=1;});
