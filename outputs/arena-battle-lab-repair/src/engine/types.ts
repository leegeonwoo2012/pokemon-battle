export type Stat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type BoostStat = Exclude<Stat, 'hp'> | 'accuracy' | 'evasion';
export type Side = 'player' | 'cpu';
export type Format = 'singles' | 'doubles';
export type Status = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze';
export type VolatileCondition = 'confusion' | 'flinch';
export type Weather = 'sun' | 'rain' | 'sand' | 'snow';
export type Field = 'electric' | 'grassy' | 'misty' | 'psychic';
export type Stats = Record<Stat, number>;

export interface Species {
  id: string;
  nationalDex: number;
  name: string;
  englishName: string;
  representativeType: string;
  types: string[];
  baseStats: Stats;
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

export type MoveTarget = 'enemy' | 'any' | 'ally' | 'self' | 'allEnemies' | 'allOthers';
export type MoveEffect =
  | { kind: 'status'; status: Status; chance?: number; target?: 'target' | 'self' }
  | { kind: 'volatile'; condition: VolatileCondition; chance?: number }
  | { kind: 'stat'; stat: BoostStat; stages: number; chance?: number; target?: 'target' | 'self' }
  | { kind: 'heal'; fraction: number; target?: 'target' | 'self' }
  | { kind: 'weather'; weather: Weather; turns?: number }
  | { kind: 'field'; field: Field; turns?: number }
  | { kind: 'drain'; fraction: number }
  | { kind: 'recoil'; fraction: number; basis?: 'maxHp' }
  | { kind: 'protect' };

export interface Move {
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
  thawsUser?: boolean;
}

/** Declarative trigger effects, applied by the engine's event handlers. */
export type PassiveEffect =
  | { trigger: 'onEnter'; kind: 'stat'; target: 'self' | 'foes'; stat: BoostStat; stages: number }
  | { trigger: 'onEnter'; kind: 'weather'; weather: Weather; turns?: number }
  | { trigger: 'onDamage'; kind: 'typeImmunity'; type: string; healFraction?: number; activateBoost?: boolean }
  | { trigger: 'onDamage'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'always' }
  | { trigger: 'onAttack'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'always' }
  | { trigger: 'onAttack'; kind: 'stabMultiplier'; multiplier: number }
  | { trigger: 'onStat'; kind: 'statMultiplier'; stat: Exclude<Stat, 'hp'>; multiplier: number; condition?: 'status'; ignoreBurn?: boolean }
  | { trigger: 'onAccuracy'; kind: 'accuracyMultiplier'; target: 'self' | 'attacker'; multiplier: number; weather?: Weather }
  | { trigger: 'onSecondary'; kind: 'chanceMultiplier'; multiplier: number }
  | { trigger: 'onStatDrop'; kind: 'statImmunity'; sourceId?: string }
  | { trigger: 'onStatDrop'; kind: 'stat'; stat: BoostStat; stages: number }
  | { trigger: 'onExit'; kind: 'heal'; fraction: number }
  | { trigger: 'onStatus'; kind: 'reflectStatus' }
  | { trigger: 'onVolatile'; kind: 'conditionImmunity'; condition: VolatileCondition }
  | { trigger: 'onCritical'; kind: 'criticalImmunity' }
  | { trigger: 'onCritical'; kind: 'criticalBoost'; stages: number }
  | { trigger: 'onChoice'; kind: 'choiceLock' }
  | { trigger: 'onDirectDamage'; kind: 'survive'; consume: boolean }
  | { trigger: 'onAfterDamage'; kind: 'heal'; fraction: number; threshold: number; consume: boolean }
  | { trigger: 'onAfterMove'; kind: 'recoil'; fraction: number }
  | { trigger: 'onSpeed'; kind: 'speedMultiplier'; weather?: Weather; multiplier: number }
  | { trigger: 'onEndTurn'; kind: 'heal'; fraction: number }
  | { trigger: 'onContact'; kind: 'status'; status: Status; chance: number }
  | { trigger: 'onContact'; kind: 'damage'; fraction: number }
  | { trigger: 'onStatus'; kind: 'statusImmunity'; status: Status };

export interface Ability { id: string; name: string; description: string; effects: PassiveEffect[] }
export interface Item { id: string; name: string; description: string; effects: PassiveEffect[] }

export interface TeamSet {
  speciesId: string;
  nickname?: string;
  moves: string[];
  abilityId: string;
  itemId: string;
  natureId: string;
  ivs?: Partial<Stats>;
  evs?: Partial<Stats>;
}

export interface Combatant {
  uid: string;
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
  protected: boolean;
  protectStreak?: number;
  lastProtectTurn?: number;
  choiceLock?: string;
  itemConsumed?: boolean;
  /** Type boosts activated by absorbing an attack; reset on switch. */
  absorbedTypes?: string[];
  confusionTurns?: number;
  flinched?: boolean;
  actedTurn?: number;
  fainted: boolean;
}

export interface SideState { team: Combatant[]; active: number[] }
export interface TargetRef { side: Side; slot: number }
export type BattleAction =
  | { kind: 'move'; slot: number; moveId: string; target?: TargetRef }
  | { kind: 'switch'; slot: number; to: number };

export interface BattleLog {
  turn: number;
  text: string;
  kind: 'system' | 'move' | 'damage' | 'status' | 'switch' | 'faint' | 'result';
}

export interface BattleState {
  format: Format;
  turn: number;
  sides: Record<Side, SideState>;
  weather: { id: Weather; turns: number } | null;
  field: { id: Field; turns: number } | null;
  log: BattleLog[];
  winner: Side | 'draw' | null;
  rngState: number;
  /** Turn of the last deliberate switch, keyed by side and active slot. */
  switchTurns?: Partial<Record<Side, Record<number, number>>>;
}

/** A real engine operation and the state immediately after it. Never stored in BattleState. */
export interface BattleEvent {
  id: number;
  kind: 'move' | 'damage' | 'heal' | 'stat' | 'status' | 'protect' | 'blocked' | 'miss'
    | 'effectiveness' | 'critical' | 'ability' | 'item' | 'switch-out' | 'switch-in'
    | 'faint' | 'weather' | 'field' | 'turn-end' | 'result' | 'message';
  text: string;
  actorUid?: string;
  targetUid?: string;
  targetUids?: string[];
  moveId?: string;
  category?: Move['category'];
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
  side?: Side;
  slot?: number;
  snapshot: BattleState;
}

export interface BattleOptions {
  format: Format;
  playerTeam: TeamSet[];
  cpuTeam: TeamSet[];
  seed?: number;
}
