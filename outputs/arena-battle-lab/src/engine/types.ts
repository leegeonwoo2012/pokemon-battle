export type Stat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type BoostStat = Exclude<Stat, 'hp'> | 'accuracy' | 'evasion';
export type Side = 'player' | 'cpu';
export type Format = 'singles' | 'doubles';
export type Status = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze';
export type Weather = 'sun' | 'rain' | 'sand' | 'snow';
export type Field = 'electric' | 'grassy' | 'misty' | 'psychic';
export type Stats = Record<Stat, number>;

export interface Species {
  id: string;
  nationalDex: number;
  name: string;
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
  | { kind: 'stat'; stat: BoostStat; stages: number; chance?: number; target?: 'target' | 'self' }
  | { kind: 'heal'; fraction: number; target?: 'target' | 'self' }
  | { kind: 'weather'; weather: Weather; turns?: number }
  | { kind: 'field'; field: Field; turns?: number }
  | { kind: 'drain'; fraction: number }
  | { kind: 'recoil'; fraction: number }
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
}

/** Declarative trigger effects, applied by the engine's event handlers. */
export type PassiveEffect =
  | { trigger: 'onEnter'; kind: 'stat'; target: 'self' | 'foes'; stat: BoostStat; stages: number }
  | { trigger: 'onEnter'; kind: 'weather'; weather: Weather; turns?: number }
  | { trigger: 'onDamage'; kind: 'typeImmunity'; type: string }
  | { trigger: 'onDamage'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'always' }
  | { trigger: 'onAttack'; kind: 'damageMultiplier'; type?: string; category?: 'physical' | 'special'; multiplier: number; condition?: 'fullHp' | 'lowHp' | 'lowPower' | 'always' }
  | { trigger: 'onAttack'; kind: 'stabMultiplier'; multiplier: number }
  | { trigger: 'onSpeed'; kind: 'speedMultiplier'; weather?: Weather; multiplier: number }
  | { trigger: 'onEndTurn'; kind: 'heal'; fraction: number }
  | { trigger: 'onContact'; kind: 'status'; status: Status; chance: number }
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
}

export interface BattleOptions {
  format: Format;
  playerTeam: TeamSet[];
  cpuTeam: TeamSet[];
  seed?: number;
}
