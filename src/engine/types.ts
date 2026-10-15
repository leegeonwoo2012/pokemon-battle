export type Stat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type BoostStat = Exclude<Stat, 'hp'> | 'accuracy' | 'evasion';
export type Side = 'player' | 'cpu';
export type Format = 'singles' | 'doubles';
export type Status = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze';
export type VolatileCondition = 'confusion' | 'flinch';
export type Weather = 'sun' | 'rain' | 'sand' | 'snow' | 'strongwinds';
export type Field = 'electric' | 'grassy' | 'misty' | 'psychic';
export type Stats = Record<Stat, number>;
export type Gimmick = 'mega' | 'tera' | 'z' | 'dynamax';

export interface Species {
  id: string;
  nationalDex: number;
  /** PokeAPI Pokémon identity; regional forms have a separate value from National Dex. */
  spriteId?: number;
  name: string;
  englishName: string;
  representativeType: string;
  types: string[];
  baseStats: Stats;
  /** Weight in kilograms, used by weight-based moves and weight abilities. */
  weightKg?: number;
  genderRatio?: { M?:number; F?:number };
  abilities: string[];
  learnset: string[];
  /** Optional original UI icon or color token; no licensed art is required. */
  color?: string;
}

export interface Nature {
  id: string;
  name: string;
  up?: Exclude<Stat, 'hp'>;
  down?: Exclude<Stat, 'hp'>;
}

export type MoveTarget = 'enemy' | 'any' | 'ally' | 'allyOrSelf' | 'self' | 'allAllies' | 'allEnemies' | 'allOthers';
export type MoveEffect =
  | { kind: 'status'; status: Status; chance?: number; target?: 'target' | 'self'; badlyPoisoned?: boolean }
  | { kind: 'volatile'; condition: VolatileCondition; chance?: number }
  | { kind: 'stat'; stat: BoostStat; stages: number; chance?: number; target?: 'target' | 'self' }
  | { kind: 'heal'; fraction: number; target?: 'target' | 'self'; weatherAdjusted?: 'sun' | 'sand'; pulseBoost?: boolean }
  | { kind: 'helpingHand' | 'dragonCheer' | 'acupressure' | 'teamCure' }
  | { kind: 'weather'; weather: Weather; turns?: number }
  | { kind: 'field'; field: Field; turns?: number }
  | { kind: 'drain'; fraction: number }
  | { kind: 'recoil'; fraction: number; basis?: 'maxHp' }
  | { kind: 'protect' }
  | { kind: 'hazard'; hazard: Hazard }
  | { kind: 'screen'; screen: ScreenCondition }
  | { kind: 'tailwind' }
  | { kind: 'trickroom' }
  | { kind: 'gravity' }
  | { kind: 'substitute' }
  | { kind: 'forceSwitch' }
  | { kind: 'recharge' }
  | { kind: 'cureBurn' }
  | { kind: 'taunt' | 'encore' }
  | { kind: 'clearHazards'; bothSides?: boolean; screens?: boolean }
  | { kind: 'saltCure' }
  | { kind: 'aquaRing' }
  | { kind: 'yawn' }
  | { kind: 'attract' }
  | { kind: 'entrainment' }
  | { kind: 'rest' }
  | { kind: 'trap' | 'suppressAbility' };

export type Hazard = 'stealthrock' | 'spikes' | 'toxicspikes' | 'stickyweb' | 'steelsurge';
export type ScreenCondition = 'reflect' | 'lightscreen' | 'auroraveil';

export interface Move {
  powered?: 'z' | 'max';
  id: string;
  name: string;
  type: string;
  category: 'physical' | 'special' | 'status';
  power: number;
  accuracy: number | null;
  pp: number;
  priority: number;
  target: MoveTarget;
  effects?: MoveEffect[];
  /** Contact moves can trigger abilities such as Static. */
  contact?: boolean;
  critStage?: number;
  /** Weather-specific accuracy overrides, null means guaranteed accuracy. */
  weatherAccuracy?: Partial<Record<Weather, number | null>>;
  powder?: boolean;
  bullet?: boolean;
  thawsUser?: boolean;
  multihit?: number | [number, number];
  /** Each strike checks accuracy separately (Population Bomb). */
  multiaccuracy?: boolean;
  /** Sound and explicitly bypassing moves pass through Substitute. */
  sound?: boolean;
  bypassSubstitute?: boolean;
  /** G-Max One Blow and Rapid Flow pierce Protect and Max Guard. */
  bypassProtect?: boolean;
  /** One-hit knockout; accuracy and immunity are checked before applying current HP as damage. */
  ohko?: boolean;
  delayedTurns?: number;
  ignoreDefenderStages?: boolean;
  ignoreAbility?: boolean;
  /** Ignore type-chart immunities caused by the listed attacking types. */
  ignoreImmunity?: string[];
  /** Ignores the target's evasion stage when calculating accuracy. */
  ignoreEvasion?: boolean;
  /** A move only exists while the user is in this battle form. */
  requiresForm?: string;
  /** Scripted damage as a fraction of the selected HP pool, before Protect reduction. */
  fixedHpFraction?: number;
  /** Which HP pool scripted fractional damage uses (Guardian of Alola uses current HP). */
  fixedHpBasis?: 'max' | 'current';
  pulse?:boolean;
  bite?:boolean;
  slicing?:boolean;
  punch?:boolean;
  /** A first-turn preparation, except in the specified weather. */
  charge?: 'always' | 'sun' | 'rain';
  semiInvulnerable?: 'underground' | 'underwater' | 'airborne' | 'vanished';
  fixedDamage?: 'counter' | 'mirrorcoat' | 'endeavor';
  dynamicPower?: 'remainingHp' | 'faintedAllies' | 'positiveBoosts' | 'friendship' | 'lowFriendship';
  pivot?: boolean;
  selfCostFraction?: number;
  selfDestruct?: boolean;
  rampage?: [number, number];
  /** Spectral Thief takes positive stat stages before damage and bypasses Substitute. */
  stealsBoosts?: boolean;
  /** Thousand Arrows can hit an airborne target and ground it after a hit. */
  groundsTarget?: boolean;
}

/** Declarative trigger effects, applied by the engine's event handlers. */
export type PassiveEffect =
  | { trigger:'onPPUse';kind:'extraPP';amount:number }
  | { trigger:'onStatChange';kind:'invertStages' }
  | { trigger:'onKO';kind:'stat';stat:BoostStat;stages:number }
  | { trigger:'onKO';kind:'bestStat' }
  | { trigger:'onAfterDamage';kind:'stat';stat:BoostStat;stages:number;threshold:number;consume?:boolean }
  | { trigger:'onAfterHit';kind:'stat';stat:BoostStat;stages:number;type?:string;category?:'physical'|'special';contact?:boolean;consume?:boolean }
  | { trigger:'onWeatherDamage';kind:'immunity';weather:Weather }
  | { trigger:'onPowder';kind:'immunity' }
  | { trigger:'onRecoil';kind:'immunity' }
  | { trigger:'onAttack';kind:'ignoreTargetAbility' }
  | { trigger:'onAttack';kind:'bypassProtect' }
  | { trigger:'onMoveType';kind:'convertType';from:string;to:string;multiplier:number }
  | { trigger:'onMultiHit';kind:'secondStrike';multiplier:number }
  | { trigger:'onSuperEffectiveDamage';kind:'damageMultiplier';multiplier:number }
  | { trigger:'onEntryHazard';kind:'hazardImmunity' }
  | { trigger:'onScreen';kind:'screenDuration';turns:number }
  | { trigger:'onMultiHit';kind:'maxHits' }
  | { trigger:'onAttack';kind:'fallenAllyBoost' }
  | { trigger:'onMoveChoice';kind:'blockStatus' }
  | { trigger:'onStatus';kind:'cureStatus';consume:true;status?:Status }
  | { trigger:'onSuperEffectiveDamage';kind:'resistType';type:string;multiplier:number;consume:true }
  | { trigger:'onSuperEffectiveHit';kind:'stat';stat:'atk'|'spa';stages:number;consume:true }
  | { trigger:'onAttack';kind:'ignoreScreens' }
  | { trigger:'onAttack';kind:'bypassSubstitute' }
  | { trigger:'onOHKO';kind:'ohkoImmunity' }
  | { trigger:'onTactical';kind:'tacticalImmunity';condition:'taunt'|'encore';target?:'self'|'allies' }
  | { trigger: 'onEnter'; kind: 'stat'; target: 'self' | 'foes'; stat: BoostStat; stages: number }
  | { trigger: 'onEnter'; kind: 'weather'; weather: Weather; turns?: number }
  | { trigger: 'onEnter'; kind: 'field'; field: Field; turns?: number }
  | { trigger: 'onPriority'; kind: 'priorityBoost'; category: 'status'; stages: number }
  | { trigger: 'onTargetStatusMove'; kind: 'statusMoveImmunity'|'reflectStatusMove' }
  | { trigger: 'onAttack' | 'onDamage'; kind: 'ignoreFoeStages' }
  | { trigger: 'onDamage'; kind: 'typeImmunity'; type: string; healFraction?: number; activateBoost?: boolean; boostStat?:BoostStat }
  | { trigger: 'onDamage'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'contact' | 'sound' | 'always' }
  | { trigger: 'onAttack'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'contact' | 'secondary' | 'recoil' | 'pulse' | 'bite' | 'slicing' | 'punch' | 'sound' | 'always'; speciesIds?:string[] }
  | { trigger: 'onAttack'; kind: 'stabMultiplier'; multiplier: number }
  | { trigger: 'onStat'; kind: 'statMultiplier'; stat: Exclude<Stat, 'hp'>; multiplier: number; condition?: 'status'|'sun'|'canEvolve'; ignoreBurn?: boolean; speciesIds?:string[] }
  | { trigger: 'onAccuracy'; kind: 'accuracyMultiplier'; target: 'self' | 'attacker'; multiplier: number; weather?: Weather }
  | { trigger: 'onAccuracy'; kind: 'accuracyAlwaysHits' }
  | { trigger: 'onAccuracy'; kind: 'ignoreEvasion' }
  | { trigger: 'onSecondary'; kind: 'chanceMultiplier'; multiplier: number }
  | { trigger: 'onStatDrop'; kind: 'statImmunity'; sourceId?: string; stat?:BoostStat }
  | { trigger: 'onStatDrop'; kind: 'stat'; stat: BoostStat; stages: number; sourceId?:string }
  | { trigger: 'onExit'; kind: 'heal'; fraction: number }
  | { trigger: 'onExit'; kind: 'cureStatus' }
  | { trigger: 'onStatus'; kind: 'reflectStatus' }
  | { trigger: 'onVolatile'; kind: 'conditionImmunity'; condition: VolatileCondition }
  | { trigger: 'onCritical'; kind: 'criticalImmunity' }
  | { trigger: 'onCritical'; kind: 'criticalBoost'; stages: number; speciesIds?:string[] }
  | { trigger: 'onChoice'; kind: 'choiceLock' }
  | { trigger: 'onDirectDamage'; kind: 'survive'; consume: boolean; chance?:number; requiresFullHp?:boolean }
  | { trigger: 'onAfterDamage'; kind: 'heal'; fraction: number; threshold: number; consume: boolean }
  | { trigger: 'onAfterMove'; kind: 'recoil'; fraction: number }
  | { trigger: 'onSpeed'; kind: 'speedMultiplier'; weather?: Weather; field?:Field; multiplier: number }
  | { trigger: 'onEndTurn'; kind: 'heal'; fraction: number; weather?:Weather }
  | { trigger: 'onEndTurn'; kind: 'stat'; stat:BoostStat; stages:number }
  | { trigger: 'onEndTurn'; kind: 'damage'; fraction:number; weather?:Weather }
  | { trigger: 'onEndTurn'; kind: 'cureStatus'; chance:number; target:'self'|'ally' }
  | { trigger: 'onContact'; kind: 'status'; status: Status; chance: number }
  | { trigger: 'onContact'; kind: 'damage'; fraction: number }
  | { trigger: 'onStatus'; kind: 'statusImmunity'; status: Status };

export interface Ability { id: string; name: string; description: string; effects: PassiveEffect[] }
export interface Item { id: string; name: string; description: string; effects: PassiveEffect[]; supported?: boolean }

export interface TeamSet {
  speciesId: string;
  nickname?: string;
  gender?: 'M' | 'F' | 'N';
  /** Friendship (0-255), used by Return and Frustration. Defaults to 255. */
  friendship?: number;
  moves: string[];
  abilityId: string;
  itemId: string;
  natureId: string;
  ivs?: Partial<Stats>;
  evs?: Partial<Stats>;
  teraType?: string;
  gigantamax?: boolean;
}

export interface Combatant {
  appearanceSpeciesId?:string;
  /** Active art/stat form from an ability such as Power Construct or Tera Shift. */
  battleFormId?:string;
  abilityFormOriginal?:{speciesName:string;types:string[];stats:Stats;abilityId:string;maxHp:number;appearanceSpeciesId?:string;battleFormId?:string};
  powerConstructActivated?:boolean;
  transformedOriginal?:{speciesName:string;types:string[];stats:Stats;abilityId:string;moves:string[];pp:Record<string,number>;stages:Record<BoostStat,number>};
  original?: { name: string; types: string[]; stats: Stats; abilityId: string; maxHp: number };
  transformation?: { kind: Gimmick|'primal'; formId?: string; turns?: number; teraType?: string };
  proteanUsed?:boolean;
  disguiseBroken?:boolean;
  battleBondActivated?:boolean;
  palafinHero?:boolean;
  morpekoHangry?:boolean;
  stanceForm?:'shield'|'blade';
  maxGuard?: boolean;
  uid: string;
  gender?:'M'|'F'|'N';
  infatuatedBy?:string;
  redirectTurn?:number;
  redirectPowder?:boolean;
  enteredTurn?:number;
  quickDrawTurn?:number;
  quickDrawCheckedTurn?:number;
  electromorphosisCharged?:boolean;
  cudChewReadyTurn?:number;
  cudChewItemId?:string;
  cudChewUsed?:boolean;
  disabledMove?:{moveId:string;turns:number};
  set: TeamSet;
  speciesName: string;
  types: string[];
  stats: Stats;
  hp: number;
  maxHp: number;
  status: Status | null;
  sleepTurns: number;
  stages: Record<BoostStat, number>;
  pp: Record<string, number>;
  /** Move-slot usage for rules such as Last Resort; persists when this Pokémon switches out. */
  usedMoveIds: string[];
  protected: boolean;
  protectStreak?: number;
  lastProtectTurn?: number;
  choiceLock?: string;
  itemConsumed?: boolean;
  consumedItemTurn?:number;
  /** Type boosts activated by absorbing an attack; reset on switch. */
  absorbedTypes?: string[];
  confusionTurns?: number;
  flinched?: boolean;
  actedTurn?: number;
  /** Turn in which this combatant actually used a move after status/flinch checks. */
  movedTurn?: number;
  /** Regigigas Slow Start: active turns remaining, reset on switching back in. */
  slowStartTurns?: number;
  lastMove?: string;
  lastReceivedHit?: { turn: number; damage: number; category: 'physical' | 'special'; sourceUid: string };
  charging?: { moveId: string; target?: TargetRef };
  rampage?: { moveId: string; remaining: number; target?: TargetRef };
  aquaRing?: boolean;
  abilityBeforeChange?: string;
  fallenAllies?: number;
  saltCured?: boolean;
  substituteHp?: number;
  stellarBoostedTypes?: string[];
  gmaxCritStages?: number;
  helpingHandTurn?: number;
  dragonCheerCritStages?: number;
  trapped?: boolean;
  trappedBy?:string;
  groundedByMove?:boolean;
  yawnTurns?: number;
  rechargeTurns?: number;
  tauntTurns?: number;
  encore?: { moveId: string; turns: number };
  tormentedMove?: { moveId: string; turns: number };
  toxicCounter?: number;
  fainted: boolean;
}

export interface SideState { team: Combatant[]; active: number[]; gimmick?: { used: boolean; kind?: Gimmick; uid?: string }; residual?: { type: string; turns: number; name: string }; hazards?: Partial<Record<Hazard, number>>; screens?: Partial<Record<ScreenCondition, number>>; tailwind?: number }
export interface TargetRef { side: Side; slot: number }
export type BattleAction =
  | { kind: 'move'; slot: number; moveId: string; target?: TargetRef; gimmick?: Gimmick; teraType?: string }
  | { kind: 'switch'; slot: number; to: number };

export interface BattleLog {
  turn: number;
  text: string;
  kind: 'system' | 'move' | 'damage' | 'status' | 'switch' | 'faint' | 'result';
}

export interface BattleState {
  /** Interactive clients may request a replacement choice instead of automatic entry. */
  manualReplacementSides?: Side[];
  format: Format;
  turn: number;
  sides: Record<Side, SideState>;
  weather: { id: Weather; turns: number } | null;
  field: { id: Field; turns: number } | null;
  log: BattleLog[];
  winner: Side | 'draw' | null;
  rngState: number;
  trickRoom?: number;
  gravity?: number;
  delayedAttacks?: {dueTurn:number;sourceUid:string;targetSide:Side;targetSlot:number;moveId:string}[];
  /** Turn of the last deliberate switch, keyed by side and active slot. */
  switchTurns?: Partial<Record<Side, Record<number, number>>>;
}

/** A real engine operation and the state immediately after it. Never stored in BattleState. */
export interface BattleEvent {
  id: number;
  kind: 'move' | 'damage' | 'heal' | 'stat' | 'status' | 'protect' | 'blocked' | 'miss'
    | 'effectiveness' | 'critical' | 'ability' | 'item' | 'switch-out' | 'switch-in'
    | 'faint' | 'weather' | 'field' | 'turn-end' | 'result' | 'message' | 'form-change' | 'gimmick-start' | 'gimmick-transform' | 'gimmick-end';
  gimmick?: Gimmick;
  formId?:string;
  text: string;
  actorUid?: string;
  targetUid?: string;
  targetUids?: string[];
  moveId?: string;
  category?: Move['category'];
  powered?: Move['powered'];
  type?: string;
  beforeHp?: number;
  afterHp?: number;
  stat?: BoostStat;
  stages?: number;
  beforeStage?: number;
  afterStage?: number;
  status?: Status | null;
  condition?: VolatileCondition;
  conditionActive?: boolean;
  sourceId?: string;
  sourceKind?: 'ability' | 'item';
  effectiveness?: number;
  critical?: boolean;
  side?: Side;
  slot?: number;
  snapshot: BattleState;
}

export interface BattleOptions {
  manualReplacementSides?: Side[];
  format: Format;
  playerTeam: TeamSet[];
  cpuTeam: TeamSet[];
  seed?: number;
}
