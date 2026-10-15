// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BattleStatusPlate, SceneActor } from './BattleVisuals';
import { createBattle } from '../engine/battle';
import { createSet } from '../team';
import type { BattleEvent } from '../engine/types';
import { physicalDimensions } from '../presentation/sprite-geometry';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const state = () => createBattle({ format: 'singles', playerTeam: [createSet('raichu')], cpuTeam: [createSet('charizard')], seed: 1 });

it('animates the HP number and meter together between the actual engine values', async () => {
  vi.useFakeTimers();
  const snapshot = state(), pokemon = snapshot.sides.player.team[0], beforeHp = pokemon.hp;
  pokemon.hp = 10;
  const event: BattleEvent = { id: 1, kind: 'damage', text: '피해', targetUid: pokemon.uid, beforeHp, afterHp: 10, snapshot };
  const view = render(<BattleStatusPlate pokemon={pokemon} side="player" slot={0} event={event} motion rate={1} />);
  const value = () => Number(view.getByRole('meter').getAttribute('aria-valuenow'));
  expect(value()).toBe(beforeHp);
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(value()).toBe(beforeHp); // The hit reaction plays before the HP starts falling.
  await act(() => vi.advanceTimersByTimeAsync(400));
  expect(value()).toBeLessThan(beforeHp); expect(value()).toBeGreaterThan(10);
  expect(view.container.querySelector('.plate-hp-text strong')?.textContent).toBe(String(value()));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(value()).toBe(10);
  expect(pokemon.hp).toBe(10);
});

it('keeps a fainting sprite available for its exit animation, then hides it', () => {
  const snapshot = state(), pokemon = snapshot.sides.player.team[0];
  pokemon.hp = 0; pokemon.fainted = true;
  const event: BattleEvent = { id: 2, kind: 'faint', text: '기절', targetUid: pokemon.uid, snapshot };
  const view = render(<SceneActor pokemon={pokemon} side="player" slot={0} event={event} />);
  expect(view.container.querySelector('.actor-fainted')).toBeNull();
  view.rerender(<SceneActor pokemon={pokemon} side="player" slot={0} event={null} />);
  expect(view.container.querySelector('.actor-fainted')).not.toBeNull();
});

it('uses the visible transformation’s physical size and keeps status icons tied to the snapshot',()=>{
  const pokemon=state().sides.player.team[0];pokemon.appearanceSpeciesId='dondozo';pokemon.status='burn';pokemon.confusionTurns=2;
  const view=render(<SceneActor pokemon={pokemon} side="player" slot={0} event={null} targetPreview="spread"/>);
  expect(Number(view.container.querySelector('.scene-actor')?.getAttribute('data-height-m'))).toBe(physicalDimensions('dondozo')?.height);
  expect(view.getByRole('img',{name:'화상'})).toBeTruthy();expect(view.getByRole('img',{name:'혼란'})).toBeTruthy();
  expect(view.container.querySelector('[data-target-preview="spread"]')).toBeTruthy();
  expect(view.container.querySelector('[data-status="burn"] .actor-status-effects')).toBeTruthy();
  pokemon.status=null;pokemon.confusionTurns=0;
  view.rerender(<SceneActor pokemon={pokemon} side="player" slot={0} event={null}/>);
  expect(view.queryByRole('img',{name:'화상'})).toBeNull();expect(view.queryByRole('img',{name:'혼란'})).toBeNull();
  expect(view.container.querySelector('[data-status="burn"]')).toBeNull();
});

it('clears low HP warnings and status effects after healing or fainting',()=>{
  const pokemon=state().sides.player.team[0];pokemon.hp=1;pokemon.status='paralysis';pokemon.types=['rock'];
  const view=render(<SceneActor pokemon={pokemon} side="player" slot={0} event={null}/>);
  expect(view.container.querySelector('[data-low-hp="true"][data-rock-type="true"][data-status="paralysis"]')).toBeTruthy();
  pokemon.hp=pokemon.maxHp;pokemon.status=null;
  view.rerender(<SceneActor pokemon={pokemon} side="player" slot={0} event={null}/>);
  expect(view.container.querySelector('[data-low-hp]')).toBeNull();
  pokemon.hp=0;pokemon.fainted=true;pokemon.status='poison';
  view.rerender(<SceneActor pokemon={pokemon} side="player" slot={0} event={null}/>);
  expect(view.container.querySelector('.actor-status-effects')).toBeNull();
  expect(view.container.querySelector('[data-status]')).toBeNull();
});
