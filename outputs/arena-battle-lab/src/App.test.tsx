// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { TEAM_STORAGE_KEY } from './team';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('arena-reduced-motion', 'true');
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('playable UI flows', () => {
  it('edits, saves, reloads a team and plays a singles turn', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /전략을 세우고/ })).toBeTruthy();

    const navigation = screen.getByRole('navigation', { name: '주 메뉴' });
    fireEvent.click(within(navigation).getByRole('button', { name: '팀 편성' }));
    expect(screen.getByRole('heading', { name: '팀 편성' })).toBeTruthy();

    const itemSelect = screen.getByLabelText(/지닌 도구/) as HTMLSelectElement;
    fireEvent.change(itemSelect, { target: { value: 'leftovers' } });
    const firstMove = document.querySelector('.move-select-list select') as HTMLSelectElement;
    fireEvent.change(firstMove, { target: { value: 'thunder' } });
    expect(itemSelect.value).toBe('leftovers');
    expect(firstMove.value).toBe('thunder');

    fireEvent.click(screen.getByRole('button', { name: /팀 저장/ }));
    expect(localStorage.getItem(TEAM_STORAGE_KEY)).toContain('"itemId":"leftovers"');
    fireEvent.change(itemSelect, { target: { value: 'none' } });
    fireEvent.change(firstMove, { target: { value: 'thunderbolt' } });
    fireEvent.click(screen.getByRole('button', { name: /불러오기/ }));
    expect((screen.getByLabelText(/지닌 도구/) as HTMLSelectElement).value).toBe('leftovers');
    expect((document.querySelector('.move-select-list select') as HTMLSelectElement).value).toBe('thunder');

    fireEvent.click(screen.getByRole('button', { name: 'ARENA 홈' }));
    fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 01');
    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /전광석화/ }));
    fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02');
    fireEvent.click(screen.getByRole('button', { name: /기록/ }));
    expect(screen.getAllByText(/전광석화 사용!/).length).toBeGreaterThan(0);
  });

  it('selects two actions and distinct targets in a doubles turn', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '더블 배틀' }));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 01');
    expect(document.querySelectorAll('.formation-player .scene-actor')).toHaveLength(2);
    expect(document.querySelectorAll('.formation-foe .scene-actor')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /전광석화/ }));
    fireEvent.click(screen.getByRole('button', { name: /상대 · 갸라도스/ }));
    const tabs = document.querySelector('.action-actors') as HTMLElement;
    fireEvent.click(within(tabs).getByRole('button', { name: /리자몽/ }));
    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /화염방사/ }));
    fireEvent.click(screen.getByRole('button', { name: /상대 · 마기라스/ }));
    expect(within(document.querySelector('.queued-actions') as HTMLElement).getByText(/피카츄: 전광석화/)).toBeTruthy();
    expect(within(document.querySelector('.queued-actions') as HTMLElement).getByText(/리자몽: 화염방사/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02');
    fireEvent.click(screen.getByRole('button', { name: /기록/ }));
    expect(screen.getAllByText(/전광석화 사용!/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/화염방사 사용!/).length).toBeGreaterThan(0);
  });

  it('resolves facing sprites by National Dex ID and shows a labeled fallback on load failure', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
    const opponent = screen.getByRole('img', { name: '마기라스 정면 스프라이트' });
    const player = screen.getByRole('img', { name: '피카츄 후면 스프라이트' });
    expect(opponent.querySelector('img')?.getAttribute('src')).toBe('/sprites/front/248.png');
    expect(player.querySelector('img')?.getAttribute('src')).toBe('/sprites/back/25.png');
    fireEvent.error(opponent.querySelector('img')!);
    expect(screen.getAllByText(/스프라이트 미제공/).length).toBeGreaterThan(0);
    expect(opponent.textContent).not.toBe('마');
  });
});
