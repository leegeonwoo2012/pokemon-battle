// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { createDefaultTeam, saveTeam } from './team';
import type { PlaybackHooks } from './presentation/queue';
import type { BattleEvent } from './engine/types';

vi.mock('./presentation/queue', async importOriginal => {
  const actual = await importOriginal<typeof import('./presentation/queue')>();
  return { ...actual, playEvents: (events: BattleEvent[], hooks: PlaybackHooks, signal: AbortSignal) => actual.playEvents(events, { ...hooks, minDurationMs: () => 0 }, signal) };
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('arena-reduced-motion', 'true');
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows the engine Choice lock after a real turn and prevents selecting other moves', async () => {
  const team = createDefaultTeam();
  team[0].itemId = 'choiceScarf';
  saveTeam(team);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
  const roster=screen.getByRole('region',{name:'내 파티'});
  for(let index=0;index<3;index++)fireEvent.click(roster.querySelectorAll('button')[index]);
  fireEvent.click(screen.getByRole('button',{name:'3마리 선출 완료'}));
  fireEvent.click(screen.getByRole('button', { name: '배틀 시작' }));
  fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
  fireEvent.click(screen.getByRole('button', { name: /라이트닝드라이브/ }));
  fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
  await waitFor(() => expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02'));
  await waitFor(() => expect(document.querySelector('.battle-scene')?.getAttribute('aria-busy')).toBe('false'));
  fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
  const dracoMeteor = screen.getByRole('button', { name: /용성군/ }) as HTMLButtonElement;
  expect(dracoMeteor.disabled).toBe(true);
  expect(dracoMeteor.title).toContain('라이트닝드라이브만');
  expect(screen.getByText('구애스카프: 교체 전까지 라이트닝드라이브만 사용할 수 있습니다.')).toBeTruthy();
  expect((screen.getByRole('button', { name: /^라이트닝드라이브/ }) as HTMLButtonElement).disabled).toBe(false);
});
