/** Distinctive moves in the playable roster, grouped by visual concept. */
export type SignatureMotif = 'time'|'space'|'moon'|'ghost'|'blade'|'hammer'|'star'|'prism'|'wave'|'storm'|'flora'|'sound'|'earth'|'flame'|'lightning'|'dragon';
type Group = { motif: SignatureMotif; symbol: string; ids: string };
const groups: Group[] = [
  {motif:'time',symbol:'◴',ids:'roaroftime doomdesire heartswap'},
  {motif:'space',symbol:'◇',ids:'spacialrend'},
  {motif:'moon',symbol:'☾',ids:'moongeistbeam lunarblessing lunardance'},
  {motif:'ghost',symbol:'◈',ids:'shadowforce phantomforce spectralthief astralbarrage lastrespects ragefist spiritshackle infernalparade bittermalice nightdaze eeriespell darkvoid trickortreat'},
  {motif:'blade',symbol:'✦',ids:'sunsteelstrike behemothblade behemothbash sacredsword bitterblade ceaselessedge stoneaxe surgingstrikes wickedblow triplearrows populationbomb direclaw kowtowcleave shellsidearm jawlock kingsshield banefulbunker'},
  {motif:'hammer',symbol:'◆',ids:'gigatonhammer doubleironbash meteorassault rockwrecker collisioncourse'},
  {motif:'star',symbol:'✧',ids:'dracometeor meteormash meteorbeam eternabeam terastarstorm lightofruin nihillight glaciallance geomancy glaciate revivalblessing happyhour'},
  {motif:'prism',symbol:'✳',ids:'photongeyser prismaticlaser multiattack mistball lusterpurge makeitrain luminacrash psychoboost psystrike psyshieldbash ficklebeam magicpowder electrify transform judgment technoblast hyperspacehole hyperspacefury diamondstorm'},
  {motif:'wave',symbol:'◉',ids:'originpulse sparklingaria snipeshot jetpunch wavecrash octolock aquastep waterspout orderup watershuriken milkdrink steameruption'},
  {motif:'storm',symbol:'☄',ids:'aeroblast bleakwindstorm wildboltstorm sandsearstorm springtidestorm dragonascent hurricane mountaingale accelerock'},
  {motif:'flora',symbol:'✿',ids:'flowertrick ivycudgel appleacid gravapple drumbeating tropkick forestscurse spicyextract syrupbomb decorate seedflare junglehealing'},
  {motif:'sound',symbol:'♫',ids:'torchsong clangingscales clangoroussoul overdrive boomburst chillyreception instruct teatime relicsong'},
  {motif:'earth',symbol:'▲',ids:'precipiceblades thousandarrows thousandwaves landswrath coreenforcer saltcure headlongrush tarshot snaptrap mortalspin shelter'},
  {motif:'flame',symbol:'✶',ids:'sacredfire blueflare vcreate searingshot pyroball armorcannon matchagotcha fusionflare blastburn fierydance firelash magmastorm beakblast'},
  {motif:'lightning',symbol:'ϟ',ids:'boltstrike fusionbolt electrodrift thundercage volttackle zingzap aurawheel doubleshock electroshot plasmafists'},
  {motif:'dragon',symbol:'❖',ids:'dynamaxcannon dragonenergy dragondarts glaiverush scaleshot flyingpress axekick iceburn freezeshock spiritbreak twinbeam barbbarrage crushgrip secretsword'},
  {motif:'hammer',symbol:'◆',ids:'doubleironbash'},
  {motif:'star',symbol:'✧',ids:'fleurcannon'},
  {motif:'ghost',symbol:'◈',ids:'malignantchain'},
  {motif:'time',symbol:'◴',ids:'courtchange noretreat tidyup'},
  {motif:'prism',symbol:'✳',ids:'fairylock topsyturvy'},
  {motif:'ghost',symbol:'◈',ids:'toxicthread'},
];

export const signatureVisuals: Record<string,{motif:SignatureMotif;symbol:string}> = Object.fromEntries(
  groups.flatMap(({motif,symbol,ids})=>ids.split(' ').map(id=>[id,{motif,symbol}])),
);
