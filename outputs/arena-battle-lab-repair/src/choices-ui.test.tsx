// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { createDefaultTeam, saveTeam } from './team';

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
  fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
  fireEvent.click(screen.getByRole('button', { name: /방어/ }));
  fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
  await waitFor(() => expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02'));
  await waitFor(() => expect(document.querySelector('.battle-scene')?.getAttribute('aria-busy')).toBe('false'));
  fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
  const quickAttack = screen.getByRole('button', { name: /전광석화/ }) as HTMLButtonElement;
  expect(quickAttack.disabled).toBe(true);
  expect(quickAttack.title).toContain('방어만');
  expect(screen.getByText('구애스카프: 교체 전까지 방어만 사용할 수 있습니다.')).toBeTruthy();
  expect((screen.getByRole('button', { name: /^방어/ }) as HTMLButtonElement).disabled).toBe(false);
});
