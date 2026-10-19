// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import App from './App';
import { TEAM_STORAGE_KEY } from './team';
import type { PlaybackHooks } from './presentation/queue';
import type { BattleEvent } from './engine/types';

// Timing is tested by queue tests and the real browser; these tests exercise UI choices.
vi.mock('./presentation/queue', async importOriginal => {
  const actual = await importOriginal<typeof import('./presentation/queue')>();
  return { ...actual, playEvents: (events: BattleEvent[], hooks: PlaybackHooks, signal: AbortSignal) => actual.playEvents(events, { ...hooks, minDurationMs: () => 0 }, signal) };
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('arena-reduced-motion', 'true');
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function completePreview(count:3|4){
  const roster=within(screen.getByRole('region',{name:'내 파티'}));
  for(let index=0;index<count;index++)fireEvent.click(roster.getAllByRole('button')[index]);
  fireEvent.click(screen.getByRole('button',{name:`${count}마리 선출 완료`}));
}

describe('playable UI flows', () => {
  it('keeps a configured Pokémon selected and intact while moving it in the party', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button',{name:'팀 편성'}));
    const item=screen.getByLabelText(/지닌 도구/) as HTMLSelectElement;
    const firstMove=document.querySelector('.move-select-list select') as HTMLSelectElement;
    const names=[...firstMove.options].map(option=>option.text);
    expect(names).toEqual([...names].sort((a,b)=>a.localeCompare(b,'ko-KR')));
    fireEvent.change(item,{target:{value:'choiceScarf'}});
    fireEvent.change(firstMove,{target:{value:'thunder'}});
    fireEvent.click(screen.getByRole('button',{name:'미라이돈 아래로 이동'}));
    expect((document.querySelectorAll('.team-slot')[1] as HTMLElement).textContent).toContain('미라이돈');
    expect(screen.getByRole('heading',{name:'미라이돈'})).toBeTruthy();
    expect((screen.getByLabelText(/지닌 도구/) as HTMLSelectElement).value).toBe('choiceScarf');
    expect((document.querySelector('.move-select-list select') as HTMLSelectElement).value).toBe('thunder');
    fireEvent.click(screen.getByRole('button',{name:'팀 저장'}));
    const saved=JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY)!);
    expect(saved.team[1]).toMatchObject({speciesId:'miraidon',itemId:'choiceScarf',moves:['thunder','dracometeor','overheat','voltswitch']});
  });

  it('shows compatible gimmick gear and lets the editor equip the matching Mega Stone', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '팀 편성' }));
    const itemSelect=screen.getByLabelText(/지닌 도구/) as HTMLSelectElement;
    expect(itemSelect.value).toBe('choiceSpecs');
    expect(screen.getByRole('button',{name:'전기 Z크리스탈 장착'})).toBeTruthy();
    fireEvent.click((document.querySelectorAll('.team-slot')[5] as HTMLButtonElement));
    expect((screen.getByLabelText(/지닌 도구/) as HTMLSelectElement).value).toBe('lucarionitez');
    for(let index=0;index<5;index++)fireEvent.click(screen.getByRole('button',{name:'루카리오 위로 이동'}));
    fireEvent.click(screen.getByRole('button',{name:'ARENA 홈'}));
    fireEvent.click(screen.getByRole('button',{name:/싱글 배틀 시작/}));
    completePreview(3);
    expect(screen.getByRole('main',{name:'배틀 시작 연출'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'배틀 시작'}));
    expect(document.querySelector('[data-gimmick="mega"]')?.hasAttribute('disabled')).toBe(false);
  });

  it('edits, saves, reloads a team and plays a singles turn', async () => {
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
    fireEvent.change(firstMove, { target: { value: 'electrodrift' } });
    fireEvent.click(screen.getByRole('button', { name: /불러오기/ }));
    expect((screen.getByLabelText(/지닌 도구/) as HTMLSelectElement).value).toBe('leftovers');
    expect((document.querySelector('.move-select-list select') as HTMLSelectElement).value).toBe('thunder');

    fireEvent.click(screen.getByRole('button', { name: 'ARENA 홈' }));
    fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
    completePreview(3);
    fireEvent.click(screen.getByRole('button',{name:'배틀 시작'}));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 01');
    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /번개/ }));
    fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
    await waitFor(() => expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02'));
    await waitFor(() => expect(document.querySelector('.battle-scene')?.getAttribute('aria-busy')).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: /기록/ }));
    expect(screen.getAllByText(/번개 사용!/).length).toBeGreaterThan(0);
  });

  it('selects two actions and distinct targets in a doubles turn', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '더블 배틀' }));
    completePreview(4);
    fireEvent.click(screen.getByRole('button',{name:'배틀 시작'}));
    expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 01');
    expect(document.querySelectorAll('.formation-player .scene-actor')).toHaveLength(2);
    expect(document.querySelectorAll('.formation-foe .scene-actor')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /라이트닝드라이브/ }));
    fireEvent.click(screen.getByRole('button', { name: /상대 · 가이오가/ }));
    const tabs = document.querySelector('.action-actors') as HTMLElement;
    fireEvent.click(within(tabs).getByRole('button', { name: /버드렉스/ }));
    fireEvent.click(screen.getByRole('button', { name: /싸운다/ }));
    fireEvent.click(screen.getByRole('button', { name: /사이코쇼크/ }));
    fireEvent.click(screen.getByRole('button', { name: /상대 · 디아루가/ }));
    expect(within(document.querySelector('.queued-actions') as HTMLElement).getByText(/미라이돈: 라이트닝드라이브/)).toBeTruthy();
    expect(within(document.querySelector('.queued-actions') as HTMLElement).getByText(/버드렉스 \(흑마\): 사이코쇼크/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /행동 결정/ }));
    await waitFor(() => expect(document.querySelector('.scene-mode')?.textContent).toContain('TURN 02'));
    await waitFor(() => expect(document.querySelector('.battle-scene')?.getAttribute('aria-busy')).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: /기록/ }));
    expect(screen.getAllByText(/라이트닝드라이브 사용!/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/사이코쇼크 사용!/).length).toBeGreaterThan(0);
  }, 15_000);

  it('marks artwork as incomplete without requesting nonexistent sprite files', async () => {
    render(<App />);
    expect(await screen.findByText('이미지 라이브러리 미완성')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /싱글 배틀 시작/ }));
    completePreview(3);
    const player=await screen.findByRole('img', { name:'미라이돈 후면 이미지 미완성' });
    expect(player.querySelector('img.sprite-fallback')?.getAttribute('src')).toBe('/sprites/unavailable.svg');
    expect(player.querySelector('img.pokemon-sprite')).toBeNull();
    expect(player.getAttribute('data-sprite-ready')).toBe('false');
    expect(screen.queryByText('스프라이트 미제공')).toBeNull();
  }, 15_000);

  it('searches the M-C roster and filters fire representatives while keeping dual types', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '포켓몬 목록' }));
    expect(document.querySelectorAll('.dex-card')).toHaveLength(387);
    fireEvent.change(screen.getByLabelText('도감 대표 타입'), {target:{value:'fire'}});
    expect(document.querySelectorAll('.dex-card')).toHaveLength(27);
    fireEvent.change(screen.getByPlaceholderText('포켓몬 검색'), {target:{value:'리자몽'}});
    expect(document.querySelectorAll('.dex-card')).toHaveLength(1);
    expect(document.querySelector('.dex-card .type-flying')).toBeTruthy();
  }, 15_000);
});
