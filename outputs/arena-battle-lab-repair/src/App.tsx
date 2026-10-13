import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PokemonArtwork, SpeciesMark } from './components/PokemonArtwork';
import { animateBattleEvent } from './presentation/animate';
import { playEvents } from './presentation/queue';
import { initializeSprites, importSpriteFiles, useSpriteLibrary } from './presentation/sprites';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Crosshair,
  Menu, Plus, RotateCcw, Save, Search, Settings2, Shield, Shuffle,
  Sparkles, Swords, Target, Trash2, Users, X, Zap,
} from 'lucide-react';
import { abilities, items, moves, natures, species, typeNames } from './data';
import { createBattle, runTurnWithEvents } from './engine/battle';
import { isMoveUsable, lockedMove, moveUnavailableReason } from './engine/choices';
import type { BattleAction, BattleEvent, BattleState, Combatant, Format, Stat, TeamSet, TargetRef } from './engine/types';
import { calculateStats, createDefaultTeam, createSet, loadTeam, saveTeam, validateTeam } from './team';

type Screen = 'home' | 'team' | 'dex' | 'settings' | 'battle';
const statKeys: Stat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const statNames: Record<Stat, string> = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
const statusNames: Record<string, string> = { burn: '화상', poison: '독', paralysis: '마비', sleep: '잠듦', freeze: '얼음' };
const weatherNames: Record<string, string> = { sun: '쾌청', rain: '비', sand: '모래바람', snow: '눈' };
const fieldNames: Record<string, string> = { electric: '일렉트릭필드', grassy: '그래스필드', misty: '미스트필드', psychic: '사이코필드' };
const cpuSpecies = ['tyranitar', 'gyarados', 'lucario', 'arcanine', 'milotic', 'togekiss'];

function TypeBadge({ type }: { type: string }) {
  return <span className={`type-badge type-${type}`}>{typeNames[type] ?? type}</span>;
}

function Header({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const nav: { screen: Screen; label: string }[] = [
    { screen: 'home', label: '홈' }, { screen: 'team', label: '팀 편성' },
    { screen: 'dex', label: '포켓몬 목록' }, { screen: 'settings', label: '설정' },
  ];
  return (
    <header className="site-header">
      <button className="brand" onClick={() => onNavigate('home')} aria-label="ARENA 홈">
        <span className="brand-mark"><Zap size={19} fill="currentColor" /></span>
        <span>ARENA<span className="brand-dot">.</span><small>BATTLE LAB</small></span>
      </button>
      <nav className={`top-nav ${open ? 'top-nav-open' : ''}`} aria-label="주 메뉴">
        {nav.map(item => <button key={item.screen} className={screen === item.screen ? 'nav-active' : ''}
          onClick={() => { onNavigate(item.screen); setOpen(false); }}>{item.label}</button>)}
      </nav>
      <div className="header-right"><span className="online-indicator" /> <span>LOCAL SIMULATOR</span></div>
      <button className="mobile-menu icon-button" aria-label="메뉴 열기" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </header>
  );
}

function Home({ team, onStart, onNavigate }: { team: TeamSet[]; onStart: (format: Format) => void; onNavigate: (screen: Screen) => void }) {
  return <main className="home-page page-enter">
    <section className="hero">
      <div className="hero-grid" />
      <div className="hero-content">
        <div className="eyebrow"><span className="pulse-dot" /> 턴제 전략 배틀 시뮬레이터 <span className="eyebrow-line" /></div>
        <h1>전략을 세우고,<br /><em>배틀을 지배하라.</em></h1>
        <p>여섯 마리의 팀을 꾸리고 한 턴의 선택에 승부를 걸어보세요. 수집과 탐험 없이, 배틀의 재미에만 집중했습니다.</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={() => onStart('singles')}><Swords size={19} /> 싱글 배틀 시작 <ArrowRight size={18} /></button>
          <button className="secondary-button" onClick={() => onStart('doubles')}><Users size={18} /> 더블 배틀</button>
        </div>
        <div className="hero-foot"><span><Check size={14} /> 오프라인 CPU 대전</span><span><Check size={14} /> 저장 가능한 팀 편성</span></div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="hero-ring hero-ring-outer" /><div className="hero-ring hero-ring-middle" /><div className="hero-ring hero-ring-inner" />
        <div className="hero-visual-core"><Zap size={68} strokeWidth={1.1} /></div>
        <div className="hero-float hero-float-one">TYPE / ELECTRIC</div>
        <div className="hero-float hero-float-two">TURN 01 • READY</div>
        <div className="hero-cross hero-cross-one">+</div><div className="hero-cross hero-cross-two">+</div>
      </div>
    </section>

    <section className="dashboard-row">
      <div className="dashboard-title"><div className="section-kicker">YOUR COMMAND CENTER</div><h2>배틀 준비 완료</h2><p>지금 바로 시작하거나 팀을 세밀하게 조정해 보세요.</p></div>
      <div className="team-preview">
        <div className="team-preview-top"><span>현재 팀</span><strong>{team.length} / 6</strong></div>
        <div className="mini-team">{team.map((set, i) => <SpeciesMark key={`${set.speciesId}-${i}`} speciesId={set.speciesId} className="mini-mon" />)}</div>
        <button onClick={() => onNavigate('team')}>팀 편성하기 <ArrowRight size={15} /></button>
      </div>
    </section>

    <section className="mode-section">
      <div className="section-heading"><div><span className="section-kicker">CHOOSE YOUR BATTLE</span><h2>플레이 모드</h2></div><span className="section-index">01 / 03</span></div>
      <div className="mode-grid">
        <button className="mode-card mode-card-single" onClick={() => onStart('singles')}>
          <span className="mode-icon"><Swords size={26} /></span><span className="mode-number">01 — SINGLE</span><strong>싱글 배틀</strong><span className="mode-description">한 마리씩 맞서는 정통 턴제 승부. 타입과 교체 타이밍이 승리를 결정합니다.</span><span className="mode-link">배틀 시작 <ArrowRight size={17} /></span>
        </button>
        <button className="mode-card mode-card-double" onClick={() => onStart('doubles')}>
          <span className="mode-icon"><Users size={26} /></span><span className="mode-number">02 — DOUBLE</span><strong>더블 배틀</strong><span className="mode-description">두 마리가 동시에 움직이는 전장. 기술의 대상과 범위를 읽어야 합니다.</span><span className="mode-link">배틀 시작 <ArrowRight size={17} /></span>
        </button>
        <button className="mode-card mode-card-team" onClick={() => onNavigate('team')}>
          <span className="mode-icon"><Shield size={26} /></span><span className="mode-number">03 — TEAM LAB</span><strong>팀 편성</strong><span className="mode-description">종족값, 성격, 노력치, 기술과 도구를 조합해 나만의 팀을 설계하세요.</span><span className="mode-link">팀 편성하기 <ArrowRight size={17} /></span>
        </button>
      </div>
    </section>
  </main>;
}

function TeamBuilder({ team, setTeam, onStart }: { team: TeamSet[]; setTeam: (team: TeamSet[]) => void; onStart: (format: Format) => void }) {
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [rosterType, setRosterType] = useState('all');
  const [speciesMode, setSpeciesMode] = useState<'add' | 'replace' | null>(null);
  const set = team[selected];
  const mon = set ? species[set.speciesId] : null;
  const stats = set && mon ? calculateStats(set) : null;
  const errors = validateTeam(team);
  const filtered = Object.values(species).filter(item => (item.name.includes(query.trim()) || item.id.includes(query.trim().toLowerCase()) || String(item.nationalDex) === query.trim()) && (rosterType === 'all' || item.representativeType === rosterType));

  function updateSet(changes: Partial<TeamSet>) {
    if (!set) return;
    const next = [...team]; next[selected] = { ...set, ...changes }; setTeam(next); setNotice('');
  }
  function updateMove(index: number, moveId: string) { const nextMoves = [...set.moves]; nextMoves[index] = moveId; updateSet({ moves: nextMoves }); }
  function updateStat(kind: 'evs' | 'ivs', stat: Stat, value: number) {
    const bounded = Math.max(0, Math.min(kind === 'evs' ? 252 : 31, Number.isFinite(value) ? value : 0));
    updateSet({ [kind]: { ...set[kind], [stat]: bounded } });
  }
  function chooseSpecies(id: string) {
    const next = [...team];
    next[selected] = createSet(id); setTeam(next); setSpeciesMode(null); setQuery(''); setNotice('');
  }
  function addSpecies(id: string) {
    if (team.some(entry => entry.speciesId === id)) { setNotice('이미 팀에 있는 포켓몬입니다.'); return; }
    if (team.length >= 6) { setNotice('팀은 최대 6마리까지 구성할 수 있습니다.'); return; }
    setTeam([...team, createSet(id)]); setSelected(team.length); setSpeciesMode(null); setQuery(''); setNotice('포켓몬을 추가했습니다.');
  }
  function removeSelected() {
    if (team.length <= 1) { setNotice('팀에는 최소 한 마리가 필요합니다.'); return; }
    setTeam(team.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); setNotice('팀에서 제외했습니다.');
  }
  function onSave() {
    try { saveTeam(team); setNotice('팀을 브라우저에 저장했습니다.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '팀을 저장하지 못했습니다.'); }
  }
  function onLoad() {
    try { const saved = loadTeam(); if (!saved) { setNotice('저장된 팀이 없습니다.'); return; } setTeam(saved); setSelected(0); setNotice('저장된 팀을 불러왔습니다.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '팀을 불러오지 못했습니다.'); }
  }

  return <main className="content-page team-page page-enter">
    <div className="page-intro"><div><span className="section-kicker">TEAM WORKSHOP</span><h1>팀 편성</h1><p>6마리의 전술을 완성하세요. 모든 설정은 실제 배틀에 적용됩니다.</p></div><div className="page-intro-actions"><button className="text-button" onClick={onLoad}><RotateCcw size={16} /> 불러오기</button><button className="primary-button compact" onClick={onSave}><Save size={17} /> 팀 저장</button></div></div>
    {notice && <div className="notice" role="status"><CircleHelp size={16} />{notice}<button onClick={() => setNotice('')} aria-label="닫기"><X size={15} /></button></div>}
    <div className="team-layout">
      <aside className="team-sidebar panel"><div className="panel-heading"><span>MY TEAM</span><strong>{team.length} / 6</strong></div>
        <div className="team-slots">{team.map((entry, index) => <button key={`${entry.speciesId}-${index}`} className={`team-slot ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)}>
          <SpeciesMark speciesId={entry.speciesId} className="slot-avatar" /><span><small>#{String(index + 1).padStart(2, '0')}</small><strong>{species[entry.speciesId]?.name ?? entry.speciesId}</strong></span><ChevronDown size={15} />
        </button>)}{team.length < 6 && <button className="add-slot" onClick={() => { setSpeciesMode('add'); setQuery(''); }}><Plus size={18} /> 포켓몬 추가</button>}</div>
        <div className="sidebar-footer"><button onClick={() => onStart('singles')}><Swords size={16} /> 싱글 출전</button><button onClick={() => onStart('doubles')}><Users size={16} /> 더블 출전</button></div>
      </aside>
      {set && mon && stats && <div className="editor-stack">
        <section className="pokemon-header panel"><PokemonArtwork speciesId={set.speciesId} size="large" /><div className="pokemon-header-copy"><span className="section-kicker">SLOT {String(selected + 1).padStart(2, '0')} / POKÉMON</span><h2>{mon.name}</h2><div className="type-row">{mon.types.map(type => <TypeBadge key={type} type={type} />)}</div><p>기본 능력치 합계 {Object.values(mon.baseStats).reduce((a, b) => a + b, 0)}</p></div><div className="pokemon-header-actions"><button className="secondary-button compact" onClick={() => { setSpeciesMode('replace'); setQuery(''); }}><Shuffle size={16} /> 포켓몬 변경</button><button className="icon-button danger" onClick={removeSelected} title="팀에서 제외"><Trash2 size={17} /></button></div></section>
        <div className="editor-grid">
          <section className="panel editor-panel"><div className="panel-heading"><span>전투 설정</span><Crosshair size={18} /></div>
            <label className="field-label">특성<select value={set.abilityId} onChange={event => updateSet({ abilityId: event.target.value })}>{mon.abilities.map(id => <option key={id} value={id}>{abilities[id]?.name}</option>)}</select><small>{abilities[set.abilityId]?.description}</small></label>
            <label className="field-label">지닌 도구<select value={set.itemId} onChange={event => updateSet({ itemId: event.target.value })}>{Object.values(items).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{items[set.itemId]?.description}</small></label>
            <label className="field-label">성격<select value={set.natureId} onChange={event => updateSet({ natureId: event.target.value })}>{Object.values(natures).map(nature => <option key={nature.id} value={nature.id}>{nature.name}{nature.up ? ` (+${statNames[nature.up]} / -${statNames[nature.down!]})` : ''}</option>)}</select></label>
          </section>
          <section className="panel editor-panel"><div className="panel-heading"><span>기술 구성</span><span className="count-pill">4 MOVES</span></div>
            <div className="move-select-list">{set.moves.map((moveId, index) => <label key={index} className="move-select"><span className="move-number">0{index + 1}</span><select value={moveId} onChange={event => updateMove(index, event.target.value)}>{mon.learnset.map(id => <option key={id} value={id}>{moves[id]?.name}</option>)}</select><TypeBadge type={moves[moveId]?.type ?? 'normal'} /></label>)}</div>
            <p className="muted-note">기술은 이 포켓몬의 학습 목록에서 선택합니다.</p>
          </section>
        </div>
        <section className="panel stats-panel"><div className="panel-heading"><span>능력치 & 훈련</span><span className="count-pill">LV. 50</span></div><div className="stats-grid">{statKeys.map(stat => <div className="stat-editor" key={stat}><div className="stat-title"><strong>{statNames[stat]}</strong><span>{stats[stat]}</span></div><div className="stat-bar"><span style={{ width: `${Math.min(100, stats[stat] / 2.3)}%` }} /></div><div className="stat-inputs"><label>EV <input type="number" min="0" max="252" step="4" value={set.evs?.[stat] ?? 0} onChange={event => updateStat('evs', stat, Number(event.target.value))} /></label><label>IV <input type="number" min="0" max="31" value={set.ivs?.[stat] ?? 31} onChange={event => updateStat('ivs', stat, Number(event.target.value))} /></label></div></div>)}</div><div className="ev-total">노력치 합계 <strong>{statKeys.reduce((sum, key) => sum + (set.evs?.[key] ?? 0), 0)} / 510</strong></div></section>
        {errors.length > 0 && <div className="validation-box"><strong>확인할 설정</strong>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}
      </div>}
    </div>
    {speciesMode && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSpeciesMode(null); }}><div className="species-modal" role="dialog" aria-modal="true" aria-label="포켓몬 선택"><div className="modal-heading"><div><span className="section-kicker">ROSTER / {Object.values(species).length} SPECIES</span><h2>포켓몬 {speciesMode === 'replace' ? '변경' : '추가'}</h2></div><button className="icon-button" onClick={() => setSpeciesMode(null)} aria-label="닫기"><X /></button></div><div className="search-field"><Search size={18} /><input autoFocus placeholder="이름 또는 영문 ID 검색" value={query} onChange={event => setQuery(event.target.value)} /></div><label className="roster-category">대표 타입<select aria-label="편성 대표 타입" value={rosterType} onChange={event => setRosterType(event.target.value)}><option value="all">전체 {Object.keys(species).length}종</option>{Object.keys(typeNames).map(type => <option key={type} value={type}>{typeNames[type]} · 10종</option>)}</select><span>{filtered.length}종 표시</span></label><div className="species-list">{filtered.map(entry => <button key={entry.id} onClick={() => speciesMode === 'replace' ? chooseSpecies(entry.id) : addSpecies(entry.id)} className="species-result"><SpeciesMark speciesId={entry.id} className="slot-avatar" /><span><strong>{entry.name}</strong><small>#{entry.nationalDex} · {entry.englishName}</small></span><span className="type-row">{entry.types.map(type => <TypeBadge key={type} type={type} />)}</span><ArrowRight size={16} /></button>)}{filtered.length === 0 && <p className="empty-state">검색 결과가 없습니다.</p>}</div><div className="modal-footer"><button onClick={() => setSpeciesMode(null)}>닫기</button><span>{speciesMode === 'replace' ? '선택한 슬롯의 포켓몬을 변경합니다.' : '새 포켓몬을 팀에 추가합니다.'}</span></div></div></div>}
  </main>;
}

function Dex({ onAdd, onRemove, team }: { onAdd: (id: string) => void; onRemove: (id:string) => void; team: TeamSet[] }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const filtered = Object.values(species).filter(mon => (mon.name.includes(query) || mon.id.includes(query.toLowerCase())) && (typeFilter === 'all' || mon.representativeType === typeFilter));
  return <main className="content-page page-enter"><div className="page-intro"><div><span className="section-kicker">BATTLE ROSTER</span><h1>포켓몬 목록</h1><p>현재 배틀에서 사용할 수 있는 {Object.keys(species).length}종의 포켓몬입니다.</p></div></div><div className="dex-controls"><div className="search-field"><Search size={18} /><input placeholder="포켓몬 검색" value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="도감 대표 타입" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">대표 타입 전체 · 180종</option>{Object.keys(typeNames).map(type => <option key={type} value={type}>{typeNames[type]} · 10종</option>)}</select></div><div className="dex-grid">{filtered.map(mon => <article className="dex-card panel" key={mon.id}><div className="dex-card-art"><PokemonArtwork speciesId={mon.id} /></div><div className="dex-card-text"><span className="dex-id">#{String(mon.nationalDex).padStart(3, '0')}</span><h2>{mon.name}</h2><div className="type-row">{mon.types.map(type => <TypeBadge key={type} type={type} />)}</div><dl className="dex-stats">{statKeys.map(stat => <div key={stat}><dt>{statNames[stat]}</dt><dd>{mon.baseStats[stat]}</dd></div>)}</dl><div className="dex-meta"><span>종족값 합계</span><strong>{Object.values(mon.baseStats).reduce((a, b) => a + b, 0)}</strong></div><button onClick={() => team.some(set => set.speciesId === mon.id) ? onRemove(mon.id) : onAdd(mon.id)}>{team.some(set => set.speciesId === mon.id) ? '팀에서 제외' : '팀에 추가'} <ArrowRight size={15} /></button></div></article>)}{filtered.length === 0 && <p className="empty-state">검색 결과가 없습니다.</p>}</div></main>;
}

function SpriteLibrarySettings() {
  const library = useSpriteLibrary();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const fronts = Object.keys(library).filter(key => key.startsWith('front/')).length;
  const backs = Object.keys(library).filter(key => key.startsWith('back/')).length;
  return <section className="panel editor-panel sprite-library-settings"><div className="panel-heading"><span>이미지 라이브러리</span><span>{fronts} / 180</span></div>
    <p>정면 {fronts}/180종 · 후면 {backs}/180종</p>
    <p>이 배포본에는 사용 허가가 확인된 포켓몬 그림이 없습니다. 이미지 준비 전에는 이름과 도감 번호로 표시하는 미완성 그래픽 모드로 동작합니다.</p>
    <p>사용 권한이 있는 PNG를 <code>front/25.png</code>, <code>back/25.png</code>와 같이 전국도감 번호로 정리한 폴더를 선택하세요. 가져온 이미지는 이 브라우저에 저장됩니다. 후면이 없으면 정면을 사용합니다.</p>
    <label className="sprite-import">{loading ? '이미지 검증 중…' : '스프라이트 폴더 가져오기'}<input aria-label="스프라이트 폴더 가져오기" type="file" multiple accept="image/png" disabled={loading} ref={node => { if (node) node.setAttribute('webkitdirectory',''); }} onChange={async event => {
      const files = event.target.files; if (!files) return; setLoading(true);
      try { const count = await importSpriteFiles(files); setMessage(`검증한 PNG ${count}개를 저장했습니다.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : '이미지를 가져오지 못했습니다.'); }
      finally { setLoading(false); }
    }} /></label>{message && <p role="status">{message}</p>}
  </section>;
}

function Settings({ reducedMotion, setReducedMotion, compactLog, setCompactLog }: { reducedMotion: boolean; setReducedMotion: (value: boolean) => void; compactLog: boolean; setCompactLog: (value: boolean) => void }) {
  return <main className="content-page settings-page page-enter"><div className="page-intro"><div><span className="section-kicker">PREFERENCES & RULES</span><h1>설정</h1><p>플레이 환경과 현재 버전의 배틀 규칙을 확인하세요.</p></div></div><div className="settings-grid"><section className="panel editor-panel"><div className="panel-heading"><span>화면 설정</span><Settings2 size={18} /></div><label className="toggle-row"><span><strong>움직임 줄이기</strong><small>등장 및 턴 애니메이션을 줄입니다.</small></span><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /></label><label className="toggle-row"><span><strong>간결한 전투 로그</strong><small>전투 로그의 표시 높이를 줄입니다.</small></span><input type="checkbox" checked={compactLog} onChange={event => setCompactLog(event.target.checked)} /></label></section><SpriteLibrarySettings /><section className="panel editor-panel"><div className="panel-heading"><span>현재 지원 규칙</span><BookOpen size={18} /></div><ul className="rules-list"><li>레벨 50, 1~6마리 팀, 싱글·더블 CPU 대전</li><li>타입 상성, 자속, 급소, 명중·회피, 기술 PP</li><li>성격·개체값·노력치, 상태 이상, 능력치 단계</li><li>일부 특성·도구·날씨·필드 효과</li><li>이 버전의 규칙과 수치는 공식 Pokémon Champions와 다를 수 있습니다.</li></ul></section></div></main>;
}

function HpBar({ pokemon }: { pokemon: Combatant }) {
  const percent = Math.max(0, Math.round(pokemon.hp / pokemon.maxHp * 100));
  return <div className={`scene-hp ${percent <= 20 ? 'scene-hp-low' : percent <= 50 ? 'scene-hp-mid' : ''}`} aria-label={`HP ${percent}%`}><span style={{ width: `${percent}%` }} /></div>;
}

function BattleStatusPlate({ pokemon, side, slot }: { pokemon: Combatant; side: 'player' | 'cpu'; slot: number }) {
  return <div className={`battle-status-plate plate-${side}`} data-status-uid={pokemon.uid}>
    <div className="plate-heading"><strong>{pokemon.speciesName}</strong><span>Lv. 50</span></div>
    <div className="plate-subline">{pokemon.types.map(type => <TypeBadge key={type} type={type} />)}{pokemon.status && <span className={`status-pill status-${pokemon.status}`}>{statusNames[pokemon.status]}</span>}{(pokemon.confusionTurns ?? 0) > 0 && <span className="status-pill" data-condition="confusion">혼란</span>}{pokemon.flinched && <span className="status-pill" data-condition="flinch">풀죽음</span>}{pokemon.fainted && <span className="status-pill">기절</span>}</div>
    <HpBar pokemon={pokemon} />
    {side === 'player' && <div className="plate-hp-text">HP <strong>{pokemon.hp}</strong><span>/ {pokemon.maxHp}</span></div>}
    {side === 'player' && <div className="plate-boosts">{Object.entries(pokemon.stages).filter(([, value]) => value !== 0).map(([key, value]) => <span key={key}>{statNames[key as Stat] ?? key} {value > 0 ? '+' : ''}{value}</span>)}</div>}
    <span className="plate-slot-index">{slot + 1}</span>
  </div>;
}

function SceneActor({ pokemon, side, slot }: { pokemon: Combatant; side: 'player' | 'cpu'; slot: number }) {
  return <div data-uid={pokemon.uid} data-species={pokemon.set.speciesId} data-slot={slot} className={`scene-actor actor-${side} actor-slot-${slot} ${pokemon.fainted ? 'actor-fainted' : ''}`}>
    <div className="actor-shadow" />
    <PokemonArtwork speciesId={pokemon.set.speciesId} facing={side === 'player' ? 'back' : 'front'} size="large" />
    {pokemon.protected && !pokemon.fainted && <span className="protected-dome" aria-label="방어 중" />}
  </div>;
}

type BattleMenu = 'root' | 'moves' | 'party' | 'bag' | 'targets';

function Battle({ state, onTurn, onRematch, onExit, compactLog, animating, playbackEvent }: { state: BattleState; onTurn: (actions: BattleAction[]) => void; onRematch: () => void; onExit: () => void; compactLog: boolean; animating: boolean; playbackEvent: BattleEvent | null }) {
  const [slot, setSlot] = useState(0);
  const [pending, setPending] = useState<BattleAction[]>([]);
  const [menu, setMenu] = useState<BattleMenu>('root');
  const [targetMove, setTargetMove] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (playbackEvent) setEventMessage(playbackEvent.text); }, [playbackEvent]);
  useEffect(() => { setPending([]); setMenu('root'); setTargetMove(null); setSlot(Math.max(0, state.sides.player.active.findIndex(index => !state.sides.player.team[index].fainted))); }, [state.turn, state.winner]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [state.log.length, showLog]);

  const player = state.sides.player;
  const cpu = state.sides.cpu;
  const active = player.team[player.active[slot]];
  const foeTargets: TargetRef[] = cpu.active.map((_, targetSlot) => ({ side: 'cpu' as const, slot: targetSlot })).filter(ref => !cpu.team[cpu.active[ref.slot]].fainted);
  const allyTargets: TargetRef[] = player.active.map((_, targetSlot) => ({ side: 'player' as const, slot: targetSlot })).filter(ref => ref.slot !== slot && !player.team[player.active[ref.slot]].fainted);
  const allReady = player.active.every((index, activeSlot) => player.team[index].fainted || pending.some(action => action.slot === activeSlot));
  const latestLog = state.log[state.log.length - 1]?.text ?? '무엇을 할까요?';
  const choiceMove = active && lockedMove(active);
  const movePrompt = choiceMove ? `${items[active.set.itemId].name}: 교체 전까지 ${moves[choiceMove]?.name}만 사용할 수 있습니다.${active.pp[choiceMove] <= 0 ? ' PP가 없어 발버둥을 사용합니다.' : ''}` : '어떤 기술을 사용할까요?';
  const prompt = animating && playbackEvent ? playbackEvent.text : state.winner ? latestLog : eventMessage ?? (menu === 'moves' ? movePrompt : menu === 'party' ? '교체할 포켓몬을 고르세요.' : menu === 'bag' ? '현재 지닌 도구와 발동 조건을 확인하세요.' : menu === 'targets' ? '기술 대상을 선택하세요.' : allReady ? '행동을 결정하고 턴을 진행하세요.' : `${active?.speciesName ?? ''}은(는) 무엇을 할까요?`);

  function targetsFor(moveId: string): TargetRef[] {
    if (moveId === 'struggle') return foeTargets;
    const move = moves[moveId];
    if (!move) return [];
    if (move.target === 'enemy') return foeTargets;
    if (move.target === 'ally') return allyTargets;
    if (move.target === 'any') return [...foeTargets, ...allyTargets];
    return [];
  }
  function queueAction(action: BattleAction) {
    setEventMessage(null);
    const next = [...pending.filter(entry => entry.slot !== action.slot), action];
    setPending(next); setMenu('root'); setTargetMove(null);
    const nextSlot = player.active.findIndex((_, index) => index !== action.slot && !player.team[player.active[index]].fainted && !next.some(entry => entry.slot === index));
    if (nextSlot >= 0) setSlot(nextSlot);
  }
  function selectMove(moveId: string) {
    if (!active || animating || !isMoveUsable(active, moveId)) return;
    setEventMessage(null);
    const targets = targetsFor(moveId);
    if (targets.length > 1) { setTargetMove(moveId); setMenu('targets'); return; }
    queueAction({ kind: 'move', slot, moveId, ...(targets[0] ? { target: targets[0] } : {}) });
  }
  function backMenu() {
    setEventMessage(null);
    if (menu === 'targets') { setMenu('moves'); setTargetMove(null); return; }
    setMenu('root');
  }
  function cancelAction() {
    setEventMessage(null);
    setPending(entries => entries.filter(action => action.slot !== slot));
    setMenu('root');
  }

  return <main className={`battle-page battle-format-${state.format} ${animating ? 'battle-is-animating' : ''}`}>
    <div className="battle-scene" data-event-kind={playbackEvent?.kind} data-event-id={playbackEvent?.id} data-event-actor={playbackEvent?.actorUid} data-event-target={playbackEvent?.targetUid} aria-busy={animating} aria-label={`${state.format === 'singles' ? '싱글' : '더블'} 배틀 장면`}>
      <div className="scene-sky"><span className="scene-cloud cloud-one" /><span className="scene-cloud cloud-two" /><span className="scene-sun" /></div>
      <div className="scene-mountains" /><div className="scene-hills" /><div className="scene-grassland" />
      <div className="scene-weather" aria-live="polite">{state.weather && <span>{weatherNames[state.weather.id]} · {state.weather.turns}턴</span>}{state.field && <span>{fieldNames[state.field.id]} · {state.field.turns}턴</span>}</div>
      <div className="scene-topbar"><button className="scene-top-button" disabled={animating} onClick={onExit}><ArrowLeft size={17} /> 나가기</button><span className="scene-mode"><i /> CPU {state.format === 'singles' ? '싱글 배틀' : '더블 배틀'} <b>·</b> TURN {String(state.turn).padStart(2, '0')}</span><button className="scene-top-button log-toggle" onClick={() => setShowLog(value => !value)}><BookOpen size={16} /> 기록</button></div>
      <div className="team-counter foe-counter" aria-label={`상대 생존 ${cpu.team.filter(pokemon => !pokemon.fainted).length}마리`}>{cpu.team.map((pokemon, index) => <i key={index} className={pokemon.fainted ? 'fainted' : ''} />)}</div>
      <div className="team-counter player-counter" aria-label={`내 생존 ${player.team.filter(pokemon => !pokemon.fainted).length}마리`}>{player.team.map((pokemon, index) => <i key={index} className={pokemon.fainted ? 'fainted' : ''} />)}</div>
      <div className="battlefield-platform platform-foe"><span /></div><div className="battlefield-platform platform-player"><span /></div>
      <div className="scene-formation formation-foe">{cpu.active.map((index, activeSlot) => <SceneActor key={cpu.team[index].uid} pokemon={cpu.team[index]} side="cpu" slot={activeSlot} />)}</div>
      <div className="scene-formation formation-player">{player.active.map((index, activeSlot) => <SceneActor key={player.team[index].uid} pokemon={player.team[index]} side="player" slot={activeSlot} />)}</div>
      <div className="status-stack status-stack-foe">{cpu.active.map((index, activeSlot) => <BattleStatusPlate key={cpu.team[index].uid} pokemon={cpu.team[index]} side="cpu" slot={activeSlot} />)}</div>
      <div className="status-stack status-stack-player">{player.active.map((index, activeSlot) => <BattleStatusPlate key={player.team[index].uid} pokemon={player.team[index]} side="player" slot={activeSlot} />)}</div>
      <div className="battle-interface">
        <div className="battle-message-box" aria-live="polite"><span className="message-mark"><Sparkles size={17} /></span><p>{prompt}</p><span className="message-cursor">▼</span></div>
        <fieldset className="battle-action-box" aria-label="전투 행동 선택" disabled={animating}>
          <div className="action-header"><span>{animating ? '전투 재생 중 · 입력 잠금' : `${active?.speciesName ?? '포켓몬'}의 차례`}</span>{state.format === 'doubles' && <div className="action-actors">{player.active.map((index, activeSlot) => <button key={activeSlot} disabled={player.team[index].fainted} className={slot === activeSlot ? 'selected' : ''} onClick={() => { setEventMessage(null); setSlot(activeSlot); setMenu('root'); setTargetMove(null); }}>{player.team[index].speciesName}{pending.some(action => action.slot === activeSlot) && <Check size={12} />}</button>)}</div>}</div>
          {state.winner ? <div className="battle-result-actions"><strong>{state.winner === 'player' ? '승리!' : state.winner === 'cpu' ? '패배' : '무승부'}</strong><button className="game-choice game-choice-confirm" onClick={onRematch}><RotateCcw size={15} /> 다시 대전</button></div> : <>
            {menu === 'root' && <div className="root-actions"><button className="game-choice game-choice-fight" onClick={() => { setEventMessage(null); setMenu('moves'); }}><Swords size={17} /> 싸운다</button><button className="game-choice" onClick={() => { setEventMessage(null); setMenu('party'); }}><Users size={17} /> 포켓몬</button><button className="game-choice" onClick={() => { setEventMessage(null); setMenu('bag'); }}><Shield size={17} /> 가방</button><button className="game-choice game-choice-disabled" disabled title="CPU 대전에서는 도망갈 수 없습니다."><ArrowRight size={17} /> 도망간다</button></div>}
            {menu === 'moves' && <div className="move-actions">{active?.set.moves.map(moveId => { const move = moves[moveId]; const unavailable = moveUnavailableReason(active, moveId); return <button key={moveId} title={unavailable} disabled={animating || !!unavailable} onClick={() => selectMove(moveId)}><span className="move-name">{move.name}</span><TypeBadge type={move.type} /><span className="move-power">{move.category === 'status' ? '변화' : `위력 ${move.power}`} · 명중 {move.accuracy ?? '필중'}</span><small>PP {active.pp[moveId]}/{move.pp}{unavailable && active.pp[moveId] > 0 ? ' · 선택 제한' : ''}</small></button>; })}{active && isMoveUsable(active, 'struggle') && <button className="struggle-choice" disabled={animating} onClick={() => selectMove('struggle')}><span className="move-name">발버둥</span><TypeBadge type="normal" /><span className="move-power">반동 피해</span><small>PP —</small></button>}<button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            {menu === 'party' && <div className="party-actions">{player.team.map((pokemon, index) => { const disabled = pokemon.fainted || player.active.includes(index) || pending.some(action => action.kind === 'switch' && action.to === index && action.slot !== slot); return <button key={pokemon.uid} disabled={disabled || animating} onClick={() => queueAction({ kind: 'switch', slot, to: index })}><SpeciesMark speciesId={pokemon.set.speciesId} className="party-mark" /><span><strong>{pokemon.speciesName}</strong><small>{pokemon.fainted ? '기절' : disabled ? '전투 중' : `HP ${pokemon.hp}/${pokemon.maxHp}`}</small><HpBar pokemon={pokemon} /></span></button>; })}<button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            {menu === 'bag' && <div className="bag-actions"><div className="bag-empty"><Shield size={22} /><span>{active?.speciesName} · {active ? items[active.set.itemId]?.name : '없음'}{active?.itemConsumed ? ' (소모됨)' : ''}</span><small>{active?.itemConsumed ? '이번 배틀에서 이미 사용한 지닌 도구입니다.' : active ? items[active.set.itemId]?.description : ''}</small><small>지닌 도구는 자동 발동합니다. 가방 소모품은 지원하지 않습니다.</small></div><button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            {menu === 'targets' && targetMove && <div className="target-actions">{targetsFor(targetMove).map(ref => { const target = state.sides[ref.side].team[state.sides[ref.side].active[ref.slot]]; return <button key={`${ref.side}-${ref.slot}`} onClick={() => queueAction({ kind: 'move', slot, moveId: targetMove, target: ref })}><Target size={15} /><span>{ref.side === 'cpu' ? '상대' : '아군'} · {target.speciesName}</span><small>Lv. 50</small></button>; })}<button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            <div className="action-footer">{pending.length > 0 && <span className="queued-actions">{pending.map(action => <small key={action.slot}>{player.team[player.active[action.slot]]?.speciesName}: {action.kind === 'switch' ? '교체' : action.moveId === 'struggle' ? '발버둥' : moves[action.moveId]?.name}</small>)}</span>}{pending.some(action => action.slot === slot) && <button className="game-choice action-cancel" onClick={cancelAction}>행동 취소</button>}{allReady ? <button className="game-choice game-choice-confirm" disabled={animating} onClick={() => onTurn(pending)}>{animating ? '진행 중…' : '행동 결정'} <ArrowRight size={15} /></button> : !pending.some(action => action.slot === slot) && <span className="choose-next">{state.format === 'doubles' && pending.length ? '다음 포켓몬의 행동을 선택하세요.' : '행동을 선택하세요.'}</span>}</div>
          </>}
        </fieldset>
      </div>
      {showLog && <div className={`battle-history ${compactLog ? 'battle-history-compact' : ''}`}><div className="history-heading"><strong>전투 기록</strong><button onClick={() => setShowLog(false)} aria-label="기록 닫기"><X size={16} /></button></div><div ref={logRef} className="history-lines">{state.log.map((entry, index) => <p key={index}><small>{String(entry.turn).padStart(2, '0')}</small>{entry.text}</p>)}</div></div>}
    </div>
  </main>;
}

export default function App() {
  const spriteLibrary = useSpriteLibrary();
  const frontCount = Object.keys(spriteLibrary).filter(key => key.startsWith('front/')).length;
  const [screen, setScreen] = useState<Screen>('home');
  const [team, setTeam] = useState<TeamSet[]>(() => { try { return loadTeam() ?? createDefaultTeam(); } catch { return createDefaultTeam(); } });
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [format, setFormat] = useState<Format>('singles');
  const [message, setMessage] = useState('');
  const [animating, setAnimating] = useState(false);
  const [playbackEvent, setPlaybackEvent] = useState<BattleEvent | null>(null);
  const playbackController = useRef<AbortController | null>(null);
  const playbackLocked = useRef(false);
  useEffect(() => { void initializeSprites(); return () => playbackController.current?.abort(); }, []);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('arena-reduced-motion') === 'true');
  const [compactLog, setCompactLog] = useState(() => localStorage.getItem('arena-compact-log') === 'true');
  useEffect(() => { localStorage.setItem('arena-reduced-motion', String(reducedMotion)); }, [reducedMotion]);
  useEffect(() => { localStorage.setItem('arena-compact-log', String(compactLog)); }, [compactLog]);
  function startBattle(nextFormat: Format) {
    const issues = validateTeam(team, nextFormat);
    if (issues.length) { setMessage(issues[0]); setScreen('team'); return; }
    try {
      const cpuTeam = cpuSpecies.map(id => createSet(id));
      setBattle(createBattle({ format: nextFormat, playerTeam: team, cpuTeam }));
      setPlaybackEvent(null); setFormat(nextFormat); setMessage(''); setScreen('battle');
    } catch (error) { setMessage(error instanceof Error ? error.message : '배틀을 시작하지 못했습니다.'); }
  }
  async function runPlayerTurn(actions: BattleAction[]) {
    if (!battle || playbackLocked.current || battle.winner) return;
    playbackLocked.current = true;
    setAnimating(true);
    const controller = new AbortController(); playbackController.current = controller;
    try {
      const result = runTurnWithEvents(battle, actions);
      await playEvents(result.events, {
        present: event => flushSync(() => { setBattle(event.snapshot); setPlaybackEvent(event); }),
        animate: (event, signal) => animateBattleEvent(document.querySelector('.battle-scene'), event, signal, reducedMotion),
        recover: () => setMessage('연출을 건너뛰고 실제 전투 결과로 복구했습니다.'),
      }, controller.signal);
      if (!controller.signal.aborted) setBattle(result.state);
    } catch (error) { setMessage(error instanceof Error ? error.message : '턴 처리 중 오류가 발생했습니다.'); }
    finally { playbackLocked.current = false; if (!controller.signal.aborted) setAnimating(false); }
  }
  function addFromDex(id: string) {
    const existing = team.findIndex(set => set.speciesId === id);
    if (existing >= 0) { setMessage(`${species[id].name}은 이미 팀에 있습니다.`); setScreen('team'); return; }
    if (team.length >= 6) { setMessage('팀이 가득 찼습니다. 팀 편성에서 기존 포켓몬을 변경하세요.'); setScreen('team'); return; }
    setTeam([...team, createSet(id)]); setMessage(`${species[id].name}을 팀에 추가했습니다.`); setScreen('team');
  }
  return <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''} ${screen === 'battle' ? 'app-shell-battle' : ''}`}>{screen !== 'battle' && <Header screen={screen} onNavigate={setScreen} />}{message && <div className="global-message" role="alert">{message}<button onClick={() => setMessage('')} aria-label="알림 닫기"><X size={16} /></button></div>}
    {screen !== 'battle' && frontCount < Object.keys(species).length && <div className="artwork-notice"><span><strong>이미지 라이브러리 미완성</strong> · 정면 {frontCount}/{Object.keys(species).length}종. 현재는 이름으로 구분하는 전투 검증 모드입니다.</span><button onClick={() => setScreen('settings')}>이미지 가져오기</button></div>}
    {screen === 'home' && <Home team={team} onStart={startBattle} onNavigate={setScreen} />}
    {screen === 'team' && <TeamBuilder team={team} setTeam={setTeam} onStart={startBattle} />}
    {screen === 'dex' && <Dex onAdd={addFromDex} team={team} onRemove={id => { if (team.length > 1) setTeam(team.filter(set => set.speciesId !== id)); else setMessage('팀에 최소 한 마리는 남겨야 합니다.'); }} />}
    {screen === 'settings' && <Settings reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} compactLog={compactLog} setCompactLog={setCompactLog} />}
    {screen === 'battle' && battle && <Battle state={battle} onTurn={runPlayerTurn} onRematch={() => startBattle(format)} onExit={() => setScreen('home')} compactLog={compactLog} animating={animating} playbackEvent={playbackEvent} />}
    {screen !== 'battle' && <footer className="site-footer"><span>ARENA / BATTLE LAB</span><span>비공식 팬 제작 배틀 · 사용자 이미지 라이브러리</span><span>© {new Date().getFullYear()} ARENA</span></footer>}
  </div>;
}
