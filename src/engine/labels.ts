import type { BoostStat, Field, Status, Weather } from './types';

export const statLabel: Record<BoostStat, string> = {
  atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드',
  accuracy: '명중률', evasion: '회피율',
};

export const statusLabel: Record<Status, string> = {
  burn: '화상', poison: '독', paralysis: '마비', sleep: '잠듦', freeze: '얼음',
};

export const weatherLabel: Record<Weather, string> = {
  sun: '쾌청', rain: '비', sand: '모래바람', snow: '눈',
};

export const fieldLabel: Record<Field, string> = {
  electric: '일렉트릭필드', grassy: '그래스필드', misty: '미스트필드', psychic: '사이코필드',
};

const sourceLabels: Record<string, string> = {
  burn: '화상', poison: '독', sand: '모래바람', drain: '흡수', recoil: '반동',
  'grassy field': '그래스필드', 'held item or ability': '특성·도구',
};

export function sourceLabel(source: string): string { return sourceLabels[source] ?? source; }
