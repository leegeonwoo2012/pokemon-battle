import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PokemonArtwork, SpeciesMark } from './components/PokemonArtwork';
import { FriendlyLobby } from './components/FriendlyLobby';
import { TeamPreviewModal } from './components/TeamPreviewModal';
import { BattleIntro } from './components/BattleIntro';
import { BattleStatusPlate, HpBar, SceneActor } from './components/BattleVisuals';
import { WeatherEffects } from './components/WeatherEffects';
import { BattleTargetOverlay, MoveChoice } from './components/BattleCommands';
import { BattleSoundSettings } from './components/BattleSoundSettings';
import { battleAudio } from './presentation/audio';
import { useBattleControls } from './presentation/battle-controls';
import { effectivenessLabel, moveHelp } from './presentation/move-help';
import { hazardNames, screenNames } from './engine/tactics';
import type { Hazard, ScreenCondition } from './engine/types';
import type { FriendMessage, FriendOutgoing, TeamPreviewEntry, TeamPreviewState, TeamSelectionPayload } from './network/friendBattle';
import { friendSocketUrl, swapBattleEvent, swapBattleSides, swapTargetSides } from './network/friendBattle';
import { animateBattleEvent,resetBattleVisuals } from './presentation/animate';
import { playEvents, playbackDuration } from './presentation/queue';
import { moveMotion } from './presentation/move-motions';
import { initializeSprites, importSpriteFiles, spriteDiagnosticReport, useSpriteDiagnostics, useSpriteLibrary } from './presentation/sprites';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Crosshair,
  Menu, Plus, RotateCcw, Save, Search, Settings2, Shield, Shuffle,
  Sparkles, Swords, Target, Trash2, Users, X, Zap, Volume2, VolumeX, FastForward,
} from 'lucide-react';
import { abilities, items, moves, natures, regulationSpecies, species, typeNames } from './data';
import { createBattle, needsReplacement, replacementSlots, runTurnWithEvents } from './engine/battle';
import { isMoveUsable, lockedMove, moveUnavailableReason } from './engine/choices';
import { dynamicMovePower, isGrounded, weatherBallMove } from './engine/calculations';
import { gimmickReason, megaFormFor, previewMove, teraTypeFromItem } from './engine/gimmicks';
import { exclusiveZMoves, gmaxForms, gimmickNames, megaForms, zMoves } from './data/gimmicks';
import { compatibleZTypes } from './engine/gimmicks';
import type { Gimmick } from './engine/types';
import type { BattleAction, BattleEvent, BattleState, Format, Move, Stat, TeamSet, TargetRef } from './engine/types';
import { alphabetizeMoves, calculateStats, createDefaultTeam, createSet, loadTeam, reorderTeam, saveTeam, validateRestrictedTeam, validateTeam, type RestrictedLimit } from './team';

type Screen = 'home' | 'team' | 'dex' | 'settings' | 'friendly' | 'preview' | 'intro' | 'battle';
const statKeys: Stat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const statNames: Record<Stat, string> = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
const weatherNames: Record<string, string> = { sun: '쾌청', rain: '비', sand: '모래바람', snow: '눈' };
const fieldNames: Record<string, string> = { electric: '일렉트릭필드', grassy: '그래스필드', misty: '미스트필드', psychic: '사이코필드' };
const cpuSpecies = ['tyranitar', 'gyarados', 'lucario', 'arcanine', 'milotic', 'gardevoir'];
const restrictedCpuSpecies = ['kyogre', 'dialga', 'palkia', 'giratina'];
const rosterSize = Object.keys(regulationSpecies).length;
const spriteCount = rosterSize * 2;
const representativeCount = (type: string) => Object.values(regulationSpecies).filter(mon => mon.representativeType === type).length;
const koreanCompare = (a: string, b: string) => a.localeCompare(b, 'ko-KR');
const sortedTypeKeys = Object.keys(typeNames).sort((a,b) => koreanCompare(typeNames[a],typeNames[b]));
function previewRoster(roster: TeamSet[]): TeamPreviewEntry[] {
  return roster.map(set => ({speciesId:set.speciesId,speciesName:species[set.speciesId]?.name??set.speciesId,level:50,
    gender:set.gender??null,form:set.speciesId,itemRevealed:false,abilityRevealed:false}));
}

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

function Home({ team, restrictedLimit, onRestricted, onStart, onNavigate, onFriend }: { team: TeamSet[]; restrictedLimit:RestrictedLimit;onRestricted:(limit:RestrictedLimit)=>void; onStart: (format: Format) => void; onNavigate: (screen: Screen) => void; onFriend: () => void }) {
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
          <button className="friend-home-button" onClick={onFriend}><Users size={18} /> 친구 친선전</button>
        </div>
        <label className="restricted-rule">초전설·환상 제한 <select aria-label="CPU 배틀 초전설 제한" value={restrictedLimit} onChange={event=>onRestricted(Number(event.target.value) as RestrictedLimit)}><option value={0}>금지</option><option value={1}>최대 1마리</option><option value={2}>최대 2마리</option><option value={3}>최대 3마리</option><option value={4}>최대 4마리</option></select></label>
        <div className="hero-foot"><span><Check size={14} /> CPU 싱글·더블</span><span><Check size={14} /> 친구와 비공개 친선전</span></div>
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
        <button className="mode-card mode-card-friend" onClick={onFriend}>
          <span className="mode-icon"><Users size={26} /></span><span className="mode-number">04 — FRIEND MATCH</span><strong>친구와 대전</strong><span className="mode-description">방 코드로 친구를 초대해 같은 규칙으로 싱글 배틀을 즐기세요.</span><span className="mode-link">친선전 준비 <ArrowRight size={17} /></span>
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
  const mon = set ? regulationSpecies[set.speciesId]??species[set.speciesId] : null;
  const stats = set && mon ? calculateStats(set) : null;
  const supportedMegaForms=set?megaForms.filter(form=>form.speciesId===set.speciesId):[];
  const zTypes=set?compatibleZTypes(set):[];
  const exclusiveZForSpecies=set?exclusiveZMoves.filter(z=>z.speciesId===set.speciesId):[];
  const errors = validateTeam(team);
  const filtered = Object.values(regulationSpecies).filter(item => (item.name.includes(query.trim()) || item.id.includes(query.trim().toLowerCase()) || String(item.nationalDex) === query.trim()) && (rosterType === 'all' || item.representativeType === rosterType));

  function updateSet(changes: Partial<TeamSet>) {
    if (!set) return;
    const next = [...team]; next[selected] = { ...set, ...changes, ...(changes.itemId&&teraTypeFromItem(changes.itemId)?{teraType:teraTypeFromItem(changes.itemId)}:{}) }; setTeam(next); setNotice('');
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
  function moveMember(from: number, to: number) {
    if (to < 0 || to >= team.length) return;
    setTeam(reorderTeam(team, from, to));
    setSelected(current => current === from ? to : current === to ? from : current);
    setNotice('파티 순서를 바꿨습니다. 기술과 도구 설정은 그대로 유지됩니다.');
  }
  function onDefaultTeam() {
    setTeam(createDefaultTeam()); setSelected(0);
    setNotice('새 기본 파티를 불러왔습니다. 저장하려면 팀 저장을 누르세요.');
  }

  return <main className="content-page team-page page-enter">
    <div className="page-intro"><div><span className="section-kicker">TEAM WORKSHOP</span><h1>팀 편성</h1><p>6마리의 전술을 완성하세요. 모든 설정은 실제 배틀에 적용됩니다.</p></div><div className="page-intro-actions"><button className="text-button" onClick={onDefaultTeam}><RotateCcw size={16} /> 새 기본 파티</button><button className="text-button" onClick={onLoad}><RotateCcw size={16} /> 불러오기</button><button className="primary-button compact" onClick={onSave}><Save size={17} /> 팀 저장</button></div></div>
    {notice && <div className="notice" role="status"><CircleHelp size={16} />{notice}<button onClick={() => setNotice('')} aria-label="닫기"><X size={15} /></button></div>}
    <div className="team-layout">
      <aside className="team-sidebar panel"><div className="panel-heading"><span>MY TEAM</span><strong>{team.length} / 6</strong></div>
        <div className="team-slots">{team.map((entry, index) => <div key={`${entry.speciesId}-${index}`} className="team-slot-row"><button className={`team-slot ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)}>
          <SpeciesMark speciesId={entry.speciesId} className="slot-avatar" /><span><small>#{String(index + 1).padStart(2, '0')}</small><strong>{species[entry.speciesId]?.name ?? entry.speciesId}</strong></span><ChevronDown size={15} />
        </button><div className="team-slot-order"><button type="button" aria-label={`${species[entry.speciesId]?.name ?? entry.speciesId} 위로 이동`} title="위로 이동" disabled={index===0} onClick={()=>moveMember(index,index-1)}><ArrowUp size={14}/></button><button type="button" aria-label={`${species[entry.speciesId]?.name ?? entry.speciesId} 아래로 이동`} title="아래로 이동" disabled={index===team.length-1} onClick={()=>moveMember(index,index+1)}><ArrowDown size={14}/></button></div></div>)}{team.length < 6 && <button className="add-slot" onClick={() => { setSpeciesMode('add'); setQuery(''); }}><Plus size={18} /> 포켓몬 추가</button>}</div>
        <div className="sidebar-footer"><button onClick={() => onStart('singles')}><Swords size={16} /> 싱글 출전</button><button onClick={() => onStart('doubles')}><Users size={16} /> 더블 출전</button></div>
      </aside>
      {set && mon && stats && <div className="editor-stack">
        <section className="pokemon-header panel"><PokemonArtwork speciesId={set.speciesId} size="large" /><div className="pokemon-header-copy"><span className="section-kicker">SLOT {String(selected + 1).padStart(2, '0')} / POKÉMON</span><h2>{mon.name}</h2><div className="type-row">{mon.types.map(type => <TypeBadge key={type} type={type} />)}</div><p>기본 능력치 합계 {Object.values(mon.baseStats).reduce((a, b) => a + b, 0)}</p></div><div className="pokemon-header-actions"><button className="secondary-button compact" onClick={() => { setSpeciesMode('replace'); setQuery(''); }}><Shuffle size={16} /> 포켓몬 변경</button><button className="icon-button danger" onClick={removeSelected} title="팀에서 제외"><Trash2 size={17} /></button></div></section>
        <div className="editor-grid">
          <section className="panel editor-panel"><div className="panel-heading"><span>전투 설정</span><Crosshair size={18} /></div>
            <label className="field-label">특성<select value={set.abilityId} onChange={event => updateSet({ abilityId: event.target.value })}>{[...mon.abilities].sort((a,b)=>koreanCompare(abilities[a]?.name??a,abilities[b]?.name??b)).map(id => <option key={id} value={id}>{abilities[id]?.name}</option>)}</select><small>{abilities[set.abilityId]?.description}</small></label>
            <label className="field-label">지닌 도구<select value={set.itemId} onChange={event => updateSet({ itemId: event.target.value })}>{Object.values(items).sort((a,b)=>koreanCompare(a.name,b.name)).map(item => <option key={item.id} value={item.id} disabled={item.supported===false}>{item.name}{item.supported===false?' · 효과 준비 중':''}</option>)}</select><small>{items[set.itemId]?.description}</small></label>
            <label className="field-label">성별<select aria-label="포켓몬 성별" value={set.gender??''} onChange={event=>updateSet({gender:event.target.value?event.target.value as 'M'|'F'|'N':undefined})}>{([{value:'',label:'자동'},...((mon.genderRatio?.M??.5)>0?[{value:'M',label:'수컷'}]:[]),...((mon.genderRatio?.F??.5)>0?[{value:'F',label:'암컷'}]:[]),...((mon.genderRatio?.M??.5)+(mon.genderRatio?.F??.5)===0?[{value:'N',label:'성별 없음'}]:[])]).sort((a,b)=>koreanCompare(a.label,b.label)).map(gender=><option key={gender.value} value={gender.value}>{gender.label}</option>)}</select></label>
            {(supportedMegaForms.length>0||zTypes.length>0||exclusiveZForSpecies.length>0)&&<div className="gimmick-loadout"><strong>기믹 도구 빠른 장착</strong><small>한 포켓몬에게 맞는 도구를 바로 골라 장착합니다.</small>{supportedMegaForms.map(form=><button key={form.id} className="gimmick-item-quickpick" aria-label={`${form.name} 메가스톤 장착`} disabled={set.itemId===form.stoneId} onClick={()=>updateSet({itemId:form.stoneId})}><Sparkles size={14}/>{set.itemId===form.stoneId?'장착됨':`${form.name} 메가스톤 장착`}<small>{form.stoneName}</small></button>)}{exclusiveZForSpecies.map(z=><button key={z.crystal} className="gimmick-item-quickpick" aria-label={`${z.name} 전용 Z크리스탈 장착`} disabled={set.itemId===z.crystal} onClick={()=>updateSet({itemId:z.crystal})}><Zap size={14}/>{set.itemId===z.crystal?'장착됨':`${z.name} 전용 Z크리스탈 장착`}<small>{items[z.crystal].name} · 필요 기술 ${moves[z.baseMove].name}</small></button>)}{zTypes.map(type=>{const crystal=zMoves[type].crystal;return <button key={type} className="gimmick-item-quickpick" aria-label={`${typeNames[type]} Z크리스탈 장착`} disabled={set.itemId===crystal} onClick={()=>updateSet({itemId:crystal})}><Zap size={14}/>{set.itemId===crystal?'장착됨':`${typeNames[type]} Z크리스탈 장착`}<small>{crystal}</small></button>;})}</div>}
            <label className="field-label">성격<select value={set.natureId} onChange={event => updateSet({ natureId: event.target.value })}>{Object.values(natures).sort((a,b)=>koreanCompare(a.name,b.name)).map(nature => <option key={nature.id} value={nature.id}>{nature.name}{nature.up ? ` (+${statNames[nature.up]} / -${statNames[nature.down!]})` : ''}</option>)}</select></label>
            <label className="field-label">테라스탈 도구<select aria-label="테라 타입" value={teraTypeFromItem(set.itemId)??''} onChange={event=>event.target.value?updateSet({itemId:`tera-${event.target.value}`,teraType:event.target.value}):updateSet({itemId:'none'})}>{[{value:"",label:"미장착"},...sortedTypeKeys.map(type=>({value:type,label:`${typeNames[type]} 테라크리스탈`}))].sort((a,b)=>koreanCompare(a.label,b.label)).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><small>이 타입의 테라크리스탈을 지녀야 배틀에서 테라스탈할 수 있습니다.</small></label>
            <label className="toggle-row"><span><strong>거다이맥스</strong><small>{gmaxForms[set.speciesId]?`${gmaxForms[set.speciesId].name} · 다이맥스밴드 장착 필요`:'이 종은 전용 거다이맥스 폼이 없습니다'}</small></span><input aria-label="거다이맥스" type="checkbox" disabled={!gmaxForms[set.speciesId]} checked={!!set.gigantamax} onChange={event=>updateSet({gigantamax:event.target.checked})}/></label>
            <button className="gimmick-item-quickpick" disabled={set.itemId==='dynamaxband'} onClick={()=>updateSet({itemId:'dynamaxband'})}>다이맥스밴드 {set.itemId==='dynamaxband'?'장착됨':'장착'}</button>
             <p className="muted-note">메가진화: {megaForms.filter(f=>f.speciesId===set.speciesId).map(f=>f.stoneName).join(' / ')||'폼 데이터 미지원'}<br/>Z기술: 대응하는 타입 크리스탈 필요<br/>테라스탈: 타입별 테라크리스탈 필요 / 트레이너당 배틀 전체에서 한 기믹만 사용</p>
          </section>
          <section className="panel editor-panel"><div className="panel-heading"><span>기술 구성</span><span className="count-pill">{set.moves.length} MOVE{set.moves.length===1?'':'S'}</span></div>
            <div className="move-select-list">{set.moves.map((moveId, index) => <label key={index} className="move-select"><span className="move-number">0{index + 1}</span><select value={moveId} onChange={event => updateMove(index, event.target.value)}>{alphabetizeMoves(mon.learnset).map(id => <option key={id} value={id}>{moves[id]?.name}</option>)}</select><TypeBadge type={moves[moveId]?.type ?? 'normal'} /></label>)}</div>
            <p className="muted-note">기술은 이 포켓몬의 학습 목록에서 선택합니다.</p>
          </section>
        </div>
        <section className="panel stats-panel"><div className="panel-heading"><span>능력치 & 훈련</span><span className="count-pill">LV. 50</span></div><div className="stats-grid">{statKeys.map(stat => <div className="stat-editor" key={stat}><div className="stat-title"><strong>{statNames[stat]}</strong><span>{stats[stat]}</span></div><div className="stat-bar"><span style={{ width: `${Math.min(100, stats[stat] / 2.3)}%` }} /></div><div className="stat-inputs"><label>EV <input type="number" min="0" max="252" step="4" value={set.evs?.[stat] ?? 0} onChange={event => updateStat('evs', stat, Number(event.target.value))} /></label><label>IV <input type="number" min="0" max="31" value={set.ivs?.[stat] ?? 31} onChange={event => updateStat('ivs', stat, Number(event.target.value))} /></label></div></div>)}</div><div className="ev-total">노력치 합계 <strong>{statKeys.reduce((sum, key) => sum + (set.evs?.[key] ?? 0), 0)} / 510</strong></div><label className="field-label friendship-control">친밀도<input aria-label="포켓몬 친밀도" type="number" min="0" max="255" value={set.friendship ?? 255} onChange={event=>updateSet({friendship:Math.max(0,Math.min(255,Number(event.target.value)||0))})} /><small>0~255 · 은혜갚기·화풀이 위력에 반영</small></label></section>
        {errors.length > 0 && <div className="validation-box"><strong>확인할 설정</strong>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}
      </div>}
    </div>
    {speciesMode && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSpeciesMode(null); }}><div className="species-modal" role="dialog" aria-modal="true" aria-label="포켓몬 선택"><div className="modal-heading"><div><span className="section-kicker">ROSTER / {rosterSize} SPECIES</span><h2>포켓몬 {speciesMode === 'replace' ? '변경' : '추가'}</h2></div><button className="icon-button" onClick={() => setSpeciesMode(null)} aria-label="닫기"><X /></button></div><div className="search-field"><Search size={18} /><input autoFocus placeholder="이름 또는 영문 ID 검색" value={query} onChange={event => setQuery(event.target.value)} /></div><label className="roster-category">대표 타입<select aria-label="편성 대표 타입" value={rosterType} onChange={event => setRosterType(event.target.value)}>{[{value:"all",label:`전체 ${rosterSize}종`},...sortedTypeKeys.filter(type=>type!=="stellar").map(type=>({value:type,label:`${typeNames[type]} · ${representativeCount(type)}종`}))].sort((a,b)=>koreanCompare(a.label,b.label)).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><span>{filtered.length}종 표시</span></label><div className="species-list">{filtered.map(entry => <button key={entry.id} onClick={() => speciesMode === 'replace' ? chooseSpecies(entry.id) : addSpecies(entry.id)} className="species-result"><SpeciesMark speciesId={entry.id} className="slot-avatar" /><span><strong>{entry.name}</strong><small>#{entry.nationalDex} · {entry.englishName}</small></span><span className="type-row">{entry.types.map(type => <TypeBadge key={type} type={type} />)}</span><ArrowRight size={16} /></button>)}{filtered.length === 0 && <p className="empty-state">검색 결과가 없습니다.</p>}</div><div className="modal-footer"><button onClick={() => setSpeciesMode(null)}>닫기</button><span>{speciesMode === 'replace' ? '선택한 슬롯의 포켓몬을 변경합니다.' : '새 포켓몬을 팀에 추가합니다.'}</span></div></div></div>}
  </main>;
}

function Dex({ onAdd, onRemove, team }: { onAdd: (id: string) => void; onRemove: (id:string) => void; team: TeamSet[] }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const filtered = Object.values(regulationSpecies).filter(mon => (mon.name.includes(query) || mon.id.includes(query.toLowerCase())) && (typeFilter === 'all' || mon.representativeType === typeFilter));
  return <main className="content-page page-enter"><div className="page-intro"><div><span className="section-kicker">BATTLE ROSTER</span><h1>포켓몬 목록</h1><p>현재 배틀에서 사용할 수 있는 {Object.keys(regulationSpecies).length}종의 포켓몬입니다.</p></div></div><div className="dex-controls"><div className="search-field"><Search size={18} /><input placeholder="포켓몬 검색" value={query} onChange={event => setQuery(event.target.value)} /></div><select aria-label="도감 대표 타입" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">대표 타입 전체 · {rosterSize}종</option>{Object.keys(typeNames).filter(type=>type!=='stellar').map(type => <option key={type} value={type}>{typeNames[type]} · {representativeCount(type)}종</option>)}</select></div><div className="dex-grid">{filtered.map(mon => <article className="dex-card panel" key={mon.id}><div className="dex-card-art"><PokemonArtwork speciesId={mon.id} /></div><div className="dex-card-text"><span className="dex-id">#{String(mon.nationalDex).padStart(3, '0')}</span><h2>{mon.name}</h2><div className="type-row">{mon.types.map(type => <TypeBadge key={type} type={type} />)}</div><dl className="dex-stats">{statKeys.map(stat => <div key={stat}><dt>{statNames[stat]}</dt><dd>{mon.baseStats[stat]}</dd></div>)}</dl><div className="dex-meta"><span>종족값 합계</span><strong>{Object.values(mon.baseStats).reduce((a, b) => a + b, 0)}</strong></div><button onClick={() => team.some(set => set.speciesId === mon.id) ? onRemove(mon.id) : onAdd(mon.id)}>{team.some(set => set.speciesId === mon.id) ? '팀에서 제외' : '팀에 추가'} <ArrowRight size={15} /></button></div></article>)}{filtered.length === 0 && <p className="empty-state">검색 결과가 없습니다.</p>}</div></main>;
}

function SpriteLibrarySettings() {
  const library = useSpriteLibrary();
  const diagnostics = useSpriteDiagnostics();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const fronts = Object.keys(library).filter(key => key.startsWith('front/')).length;
  const backs = Object.keys(library).filter(key => key.startsWith('back/')).length;
  return <section className="panel editor-panel sprite-library-settings"><div className="panel-heading"><span>이미지 라이브러리</span><span>{fronts} / {rosterSize}</span></div>
    <p>디코딩 확인: 정면 {fronts}/{rosterSize}종 · 후면 {backs}/{rosterSize}종{diagnostics.phase==='checking'?' · 검사 중…':''}</p>
    <p>준비된 포켓몬 그림을 사용합니다. 원본이 없는 종은 종 이름과 명확한 대체 이미지를 표시합니다. 정면 대체는 후면 로딩 성공으로 세지 않습니다.</p>
    <p><a href={`${import.meta.env.BASE_URL}sprites/CREDITS.md`} target="_blank" rel="noreferrer">그림 출처·저작자·이용 조건</a> · 팬 제작 작품은 CC BY-NC, PokeAPI 이미지에는 Pokémon Company 저작권 고지가 적용됩니다.</p>
    <p>사용 권한이 있는 PNG를 <code>front/25.png</code>, <code>back/25.png</code>와 같이 전국도감 번호로 정리한 폴더를 선택하세요. 가져온 이미지는 이 브라우저에 저장됩니다. 후면이 없으면 정면을 사용합니다.</p>
    <label className="sprite-import">{loading ? '이미지 검증 중…' : '스프라이트 폴더 가져오기'}<input aria-label="스프라이트 폴더 가져오기" type="file" multiple accept="image/png" disabled={loading||diagnostics.phase==='checking'} ref={node => { if (node) node.setAttribute('webkitdirectory',''); }} onChange={async event => {
      const files = event.target.files; if (!files) return; setLoading(true);
      try { const count = await importSpriteFiles(files); setMessage(`검증한 PNG ${count}개를 저장했습니다.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : '이미지를 가져오지 못했습니다.'); }
      finally { setLoading(false); }
    }} /></label><div className="sprite-diagnostic-actions"><button className="secondary-button compact" disabled={loading||diagnostics.phase==='checking'} onClick={async()=>{setLoading(true);try{await initializeSprites(true);const result=spriteDiagnosticReport();setMessage(`검사 완료: 성공 ${result.success}, 누락·실패 ${result.failed} (${spriteCount}개 기준)`);}finally{setLoading(false);}}}>이미지 다시 검사</button><button className="secondary-button compact" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(spriteDiagnosticReport(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='sprite-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>진단 JSON 저장</button></div>{diagnostics.issues.length>0&&<ul className="sprite-issues">{diagnostics.issues.slice(0,8).map((issue,index)=><li key={index}>{issue.key??issue.path}: {issue.reason}{issue.httpStatus!==undefined?` · HTTP ${issue.httpStatus}`:''}</li>)}</ul>}{message && <p role="status">{message}</p>}
  </section>;
}

function Settings({ reducedMotion, setReducedMotion, compactLog, setCompactLog }: { reducedMotion: boolean; setReducedMotion: (value: boolean) => void; compactLog: boolean; setCompactLog: (value: boolean) => void }) {
  return <main className="content-page settings-page page-enter"><div className="page-intro"><div><span className="section-kicker">PREFERENCES & RULES</span><h1>설정</h1><p>플레이 환경과 현재 버전의 배틀 규칙을 확인하세요.</p></div></div><div className="settings-grid"><section className="panel editor-panel"><div className="panel-heading"><span>화면 설정</span><Settings2 size={18} /></div><label className="toggle-row"><span><strong>움직임 줄이기</strong><small>등장 및 턴 애니메이션을 줄입니다.</small></span><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /></label><label className="toggle-row"><span><strong>간결한 전투 로그</strong><small>전투 로그의 표시 높이를 줄입니다.</small></span><input type="checkbox" checked={compactLog} onChange={event => setCompactLog(event.target.checked)} /></label></section><SpriteLibrarySettings /><BattleSoundSettings /><section className="panel editor-panel"><div className="panel-heading"><span>현재 지원 규칙</span><BookOpen size={18} /></div><ul className="rules-list"><li>레벨 50, 1~6마리 팀, CPU 싱글·더블과 친구 친선 싱글·더블</li><li>타입 상성, 자속, 급소, 명중·회피, 기술 PP</li><li>성격·개체값·노력치, 상태 이상, 능력치 단계</li><li>로스터 적용 가능 특성 효과 230종 · 도구·날씨·필드 처리</li><li>설치기 4종·장막 3종·트릭룸·순풍·도발·앵콜·설치물 제거·연속 공격</li><li>배틀 로스터 {Object.keys(regulationSpecies).length}종·폼 · 메가진화 {megaForms.length}폼 · 원시회귀 2폼 · 테라스탈 19타입 · 일반 Z기술 · 다이맥스 · 거다이맥스 {Object.keys(gmaxForms).length}종</li><li>초전설·환상은 싱글·더블 모두 0~4마리까지 설정 가능 · 트레이너당 배틀 전체에서 한 기믹만 사용</li><li>도주 특성은 트레이너전에서 발동하지 않습니다 · 공식 Showdown/본가 엔진의 모든 예외와 완전히 같지는 않습니다.</li></ul></section></div></main>;
}

type BattleMenu = 'root' | 'moves' | 'party' | 'bag' | 'targets';

function Battle({ state, onTurn, onRematch, onExit, compactLog, animating, playbackEvent, friendMode, friendRole, friendNames, waitingOpponent, reducedMotion, playbackRate, setPlaybackRate, sound, setSound, onSkip }: { state: BattleState; onTurn: (actions: BattleAction[]) => void; onRematch: () => void; onExit: () => void; compactLog: boolean; animating: boolean; playbackEvent: BattleEvent | null; friendMode: boolean; friendRole: 'host' | 'guest' | null; friendNames: { player: string; opponent: string }; waitingOpponent: boolean; reducedMotion: boolean; playbackRate: number; setPlaybackRate: (rate: number) => void; sound: boolean; setSound: (sound: boolean) => void; onSkip: () => void }) {
  const [slot, setSlot] = useState(0);
  const [pending, setPending] = useState<BattleAction[]>([]);
  const [menu, setMenu] = useState<BattleMenu>('root');
  const [targetMove, setTargetMove] = useState<string | null>(null);
  const [hoverMove,setHoverMove]=useState<string|null>(null);
  const [hoverTarget,setHoverTarget]=useState<TargetRef|null>(null);
  useEffect(()=>{setHoverMove(null);setHoverTarget(null);},[menu,slot,state.turn]);
  const [gimmickSelection,setGimmickSelection]=useState<Partial<Record<number,Gimmick>>>({});
  const [showLog, setShowLog] = useState(false);
  const [showDetails,setShowDetails]=useState(false);
  const [music,setMusic]=useState(()=>localStorage.getItem('arena-music')==='true');
  useEffect(()=>{localStorage.setItem('arena-music',String(music));if(music&&!state.winner)battleAudio.startMusic();else battleAudio.stopMusic();return ()=>battleAudio.stopMusic();},[music,state.winner]);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<BattleEvent | null>(null);
  const replacementKey = replacementSlots(state, 'player').join(',');
  const replacing = needsReplacement(state);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (playbackEvent) setEventMessage(playbackEvent.text); }, [playbackEvent]);
  useEffect(() => {
    if (playbackEvent?.kind === 'move') setActionEvent(playbackEvent);
    else if (!playbackEvent || !playbackEvent.moveId || ['switch-in', 'switch-out', 'gimmick-start', 'turn-end'].includes(playbackEvent.kind)) setActionEvent(null);
  }, [playbackEvent]);
  useEffect(() => {
    const forced=state.sides.player.active.flatMap((index,slot)=>{
      const mon=state.sides.player.team[index],locked=mon?.charging??mon?.rampage;
      return locked&&!mon.fainted?[{kind:'move' as const,slot,moveId:locked.moveId,target:locked.target}]:[];
    });
    setPending(forced); setGimmickSelection({}); setMenu(replacementKey ? 'party' : 'root'); setEventMessage(null); setTargetMove(null);
    setSlot(replacementKey ? Number(replacementKey.split(',')[0]) : Math.max(0, state.sides.player.active.findIndex(index => !state.sides.player.team[index].fainted)));
  }, [state.turn, state.winner, replacementKey]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [state.log.length, showLog]);

  const player = state.sides.player;
  const cpu = state.sides.cpu;
  const active = player.team[player.active[slot]];
  const forcedMoveId=active?.charging?.moveId??active?.rampage?.moveId;
  const reservedGimmick=pending.some(a=>a.kind==='move'&&a.gimmick&&a.slot!==slot);
  const selectedGimmick=reservedGimmick?undefined:gimmickSelection[slot];
  const selectedTeraType=teraTypeFromItem(active?.set.itemId??'')??active?.set.teraType??active?.types[0]??'normal';
  const selectedMega=active&&selectedGimmick==='mega'?megaFormFor(active):undefined;
  const actionPokemon=selectedGimmick==='dynamax'&&active?{...active,transformation:{kind:'dynamax' as const}}:selectedMega?{...active,transformation:{kind:'mega' as const,formId:selectedMega.id}}:active;
  const foeTargets: TargetRef[] = cpu.active.map((_, targetSlot) => ({ side: 'cpu' as const, slot: targetSlot })).filter(ref => !cpu.team[cpu.active[ref.slot]].fainted);
  const allyTargets: TargetRef[] = player.active.map((_, targetSlot) => ({ side: 'player' as const, slot: targetSlot })).filter(ref => ref.slot !== slot && !player.team[player.active[ref.slot]].fainted);
  const allReady = replacing ? replacementSlots(state, 'player').length > 0 && replacementSlots(state, 'player').every(activeSlot => pending.some(action => action.kind === 'switch' && action.slot === activeSlot)) : player.active.every((index, activeSlot) => player.team[index].fainted || pending.some(action => action.slot === activeSlot));
  const latestLog = state.log[state.log.length - 1]?.text ?? '무엇을 할까요?';
  const namedEvent = playbackEvent?.kind === 'move' ? playbackEvent : actionEvent?.moveId === playbackEvent?.moveId ? actionEvent : null;
  const eventCombatants = namedEvent ? Object.values(namedEvent.snapshot.sides).flatMap(side => side.team) : [];
  const eventActor = eventCombatants.find(pokemon => pokemon.uid === namedEvent?.actorUid) ?? Object.values(state.sides).flatMap(side => side.team).find(mon => mon.uid === playbackEvent?.actorUid);
  const eventActorSide = state.sides.cpu.team.some(pokemon => pokemon.uid === (namedEvent?.actorUid ?? playbackEvent?.actorUid)) ? '상대' : '내';
  const eventTargets = (namedEvent?.targetUids ?? (namedEvent?.targetUid ? [namedEvent.targetUid] : [])).map(uid => eventCombatants.find(pokemon => pokemon.uid === uid)?.speciesName).filter(Boolean);
  const isMoveEvent = playbackEvent?.kind === 'move';
  const eventMove = namedEvent ? moves[namedEvent.moveId ?? ''] : undefined;
  const moveEventLabel = eventMove?.name ?? namedEvent?.text.split(': ').at(-1)?.replace(/\s사용!$/, '') ?? '';
  const eventType = namedEvent?.type ?? playbackEvent?.type ?? eventMove?.type ?? 'normal';
  const eventCategory = namedEvent?.category ?? eventMove?.category;
  const eventCue = isMoveEvent ? moveMotion({ id: playbackEvent.moveId ?? '', type: eventType, category: eventCategory ?? 'physical' }).cue : '';
  const choiceMove = active && lockedMove(active);
  const movePrompt = choiceMove ? `${items[active.set.itemId].name}: 교체 전까지 ${moves[choiceMove]?.name}만 사용할 수 있습니다.${active.pp[choiceMove] <= 0 ? ' PP가 없어 발버둥을 사용합니다.' : ''}` : '어떤 기술을 사용할까요?';
  const playbackLine = playbackEvent && eventActor
    ? playbackEvent.kind === 'move' && namedEvent ? `${eventActorSide} ${eventActor.speciesName} · ${moveEventLabel} 사용!`
      : playbackEvent.kind === 'protect' ? `${eventActorSide} ${eventActor.speciesName} · 방어 성공!`
      : playbackEvent.kind === 'switch-out' ? `${eventActorSide} ${eventActor.speciesName} 교체!`
      : playbackEvent.kind === 'switch-in' ? `${eventActorSide} ${eventActor.speciesName} 출전!`
      : playbackEvent.text
    : playbackEvent?.text;
  const prompt = animating && playbackEvent ? playbackLine : waitingOpponent ? '친구의 행동을 기다리는 중입니다…' : state.winner ? latestLog : replacing ? (replacementKey ? '다음으로 출전할 포켓몬을 선택하세요!' : '상대가 다음 포켓몬을 고르고 있습니다…') : eventMessage ?? (forcedMoveId ? `${active.speciesName}은(는) ${moves[forcedMoveId]?.name??forcedMoveId}을(를) 계속 사용합니다.` : menu === 'moves' ? movePrompt : menu === 'party' ? '교체할 포켓몬을 고르세요.' : menu === 'bag' ? '현재 지닌 도구와 발동 조건을 확인하세요.' : menu === 'targets' ? '기술 대상을 선택하세요.' : allReady ? '행동을 결정하고 턴을 진행하세요.' : `${active?.speciesName ?? ''}은(는) 무엇을 할까요?`);

  function battleMovePreview(move: Move): Move {
    return move.id==='expandingforce'&&state.field?.id==='psychic'&&active&&isGrounded(active,state)
      ? {...move,target:'allEnemies'}
      : move;
  }

  function targetsFor(moveId: string): TargetRef[] {
    if (moveId === 'struggle') return foeTargets;
    const move = active&&moves[moveId]?battleMovePreview(weatherBallMove(state,active,previewMove(active,moves[moveId],selectedGimmick,selectedTeraType))):undefined;
    if (!move) return [];
    if (move.target === 'enemy') return foeTargets;
    if (move.target === 'ally') return allyTargets;
    if (move.target === 'allyOrSelf') return [{side:'player',slot},...allyTargets];
    if (move.target === 'any') return [...foeTargets, ...allyTargets];
    return [];
  }
  function queueAction(action: BattleAction) {
    if(forcedMoveId&&(action.kind==='switch'||action.kind==='move'&&action.moveId!==forcedMoveId))return;
    battleAudio.confirm();
    if(action.kind==='move'&&selectedGimmick) action={...action,gimmick:selectedGimmick,...(selectedGimmick==='tera'?{teraType:selectedTeraType}:{})};
    if(action.kind==='switch') setGimmickSelection(previous=>({...previous,[slot]:undefined}));
    setEventMessage(null);
    const next = [...pending.filter(entry => entry.slot !== action.slot), action];
    setPending(next); setMenu('root'); setTargetMove(null);
    const nextSlot = replacing ? replacementSlots(state, 'player').find(index => !next.some(entry => entry.slot === index)) : player.active.findIndex((_, index) => index !== action.slot && !player.team[player.active[index]].fainted && !next.some(entry => entry.slot === index));
    if (nextSlot !== undefined && nextSlot >= 0) { setSlot(nextSlot); if (replacing) setMenu('party'); }
  }
  function selectMove(moveId: string) {
    if (!active || animating || !isMoveUsable(actionPokemon, moveId,selectedGimmick==='z') || selectedGimmick==='z'&&gimmickReason(state,'player',active,'z',moveId)) return;
    setEventMessage(null);
    const targets = targetsFor(moveId);
    if (targets.length > 1) { setTargetMove(moveId); setMenu('targets'); return; }
    queueAction({ kind: 'move', slot, moveId, ...(targets[0] ? { target: targets[0] } : {}) });
  }
  function backMenu() {
    battleAudio.cancel();setShowDetails(false);
    setEventMessage(null);
    if (menu === 'targets') { setMenu('moves'); setTargetMove(null); return; }
    setMenu(replacing ? 'party' : 'root');
  }
  function cancelAction() {
    if(forcedMoveId)return;
    setEventMessage(null);
    setPending(entries => entries.filter(action => action.slot !== slot));
    setMenu(replacing ? 'party' : 'root');
  }
  function sceneTarget(side: 'player' | 'cpu', targetSlot: number) {
    if (menu !== 'targets' || !targetMove || animating || waitingOpponent || !targetsFor(targetMove).some(ref => ref.side === side && ref.slot === targetSlot)) return undefined;
    return () => queueAction({ kind: 'move', slot, moveId: targetMove, target: { side, slot: targetSlot } });
  }
  function queuedLabel(action: BattleAction) {
    if (action.kind === 'switch') return `→ ${player.team[action.to].speciesName}`;
    const mon = player.team[player.active[action.slot]];
    return action.moveId === 'struggle' ? '발버둥' : previewMove(mon, moves[action.moveId], action.gimmick).name;
  }
  const previewId=menu==='targets'?targetMove:menu==='moves'?hoverMove:null;
  const previewAttack=previewId&&active&&moves[previewId]?battleMovePreview(weatherBallMove(state,active,previewMove(active,moves[previewId],selectedGimmick,selectedTeraType))):null;
  const spreadPreview=previewAttack?.target==='allEnemies'||previewAttack?.target==='allOthers';
  const previewRefs:TargetRef[]=!animating&&previewId&&previewAttack?(hoverTarget?[hoverTarget]:spreadPreview?[...foeTargets,...(previewAttack.target==='allOthers'?allyTargets:[])]:targetsFor(previewId)):[];
  const previewUids=previewRefs.map(ref=>state.sides[ref.side].team[state.sides[ref.side].active[ref.slot]].uid);
  const previewFor=(uid:string)=>previewUids.includes(uid)?spreadPreview?'spread' as const:'single' as const:undefined;
  useBattleControls(menu,animating||waitingOpponent||!!state.winner,backMenu,()=>{setShowLog(false);setShowDetails(false);});
  const details=<> <h3>전장</h3><p>{state.trickRoom?`트릭룸 ${state.trickRoom}턴`:'트릭룸 없음'}</p>{(['player','cpu'] as const).map(side=><div key={side}><strong>{side==='player'?'아군':'상대'}</strong><p>{state.sides[side].tailwind?`순풍 ${state.sides[side].tailwind}턴 · `:''}{Object.entries(state.sides[side].screens??{}).map(([id,turns])=>`${screenNames[id as ScreenCondition]} ${turns}턴`).join(' / ')||'장막 없음'}</p><p>{Object.entries(state.sides[side].hazards??{}).filter(([,layers])=>layers).map(([id,layers])=>`${hazardNames[id as Hazard]} ${layers}겹`).join(' / ')||'설치물 없음'}</p></div>)}<h3>{active?.speciesName}의 기술</h3>{active?.set.moves.map(id=><p key={id}><b>{moves[id].name}</b><br/>{moveHelp(weatherBallMove(state,active,previewMove(active,moves[id],selectedGimmick,selectedTeraType)))}</p>)}<small>방향키: 선택 · Enter/A: 결정 · Esc/B: 뒤로 · 숫자: 기술/파티 선택<br/>상성 표시는 현재 타입·지원되는 면역 특성을 기준으로 합니다.</small></>;

  return <main className={`battle-page battle-format-${state.format} ${animating ? 'battle-is-animating' : ''}`}>
    <div className="battle-scene" data-weather={state.weather?.id} data-field={state.field?.id} data-danger={player.active.some(index=>!player.team[index].fainted&&player.team[index].hp/player.team[index].maxHp<=.1)||playbackEvent?.kind==='faint'&&player.team.some(mon=>mon.uid===playbackEvent.targetUid)||undefined} data-playback-rate={playbackRate} data-event-kind={playbackEvent?.kind} data-event-id={playbackEvent?.id} data-event-actor={playbackEvent?.actorUid} data-event-target={playbackEvent?.targetUid} aria-busy={animating} aria-label={`${state.format === 'singles' ? '싱글' : '더블'} 배틀 장면`}>
      <div className="scene-weather" aria-live="polite">{state.weather && <span>{weatherNames[state.weather.id]} · {state.weather.turns}턴</span>}{state.field && <span>{fieldNames[state.field.id]} · {state.field.turns}턴</span>}</div>
      <div className="scene-topbar"><button className="scene-top-button" disabled={animating} onClick={onExit}><ArrowLeft size={17} /> 나가기</button><span className="scene-mode"><i /> {friendMode ? `${friendNames.player} VS ${friendNames.opponent} · 친선전` : `CPU ${state.format === 'singles' ? '싱글 배틀' : '더블 배틀'}`} <b>·</b> TURN {String(state.turn).padStart(2, '0')}</span><button className="scene-top-button log-toggle" onClick={() => setShowLog(value => !value)}><BookOpen size={16} /> 기록</button></div>
      <div className="playback-tools" aria-label="배틀 재생 설정"><button aria-label="전장과 기술 설명" onClick={()=>setShowDetails(value=>!value)}><CircleHelp size={16}/></button><button aria-label={music?"배경음악 끄기":"배경음악 켜기"} aria-pressed={music} onClick={()=>{battleAudio.unlock();setMusic(value=>!value);}}>BGM</button><label><span>속도</span><select aria-label="배틀 재생 속도" value={playbackRate} disabled={animating} onChange={event => setPlaybackRate(Number(event.target.value))}><option value={.75}>느리게</option><option value={1}>보통</option><option value={1.5}>빠르게</option></select></label><button aria-label={sound ? '효과음 끄기' : '효과음 켜기'} aria-pressed={sound} onClick={() => { battleAudio.enabled = !sound; battleAudio.unlock(); setSound(!sound); }}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>{animating && <button disabled={friendRole === 'guest'} title={friendRole === 'guest' ? '친선전 재생 속도는 호스트가 결정합니다.' : '계산된 결과까지 연출을 건너뜁니다.'} onClick={onSkip}><FastForward size={15} /><span>연출 건너뛰기</span></button>}</div>
      <div className="team-counter foe-counter" aria-label={`상대 생존 ${cpu.team.filter(pokemon => !pokemon.fainted).length}마리`}>{cpu.team.map((pokemon, index) => <i key={index} className={pokemon.fainted ? 'fainted' : ''} />)}</div>
      <div className="team-counter player-counter" aria-label={`내 생존 ${player.team.filter(pokemon => !pokemon.fainted).length}마리`}>{player.team.map((pokemon, index) => <i key={index} className={pokemon.fainted ? 'fainted' : ''} />)}</div>
      <div className="battle-camera">
        <div className="stadium-roof"/><div className="stadium-stands" aria-hidden="true"/><div className="stadium-ribbon" aria-hidden="true"><span>ARENA LEAGUE</span><span>◉</span><span>ARENA LEAGUE</span><span>◉</span><span>ARENA LEAGUE</span></div>
        <div className="stadium-floor" aria-hidden="true"/><div className="stadium-spotlight spotlight-left" aria-hidden="true"/><div className="stadium-spotlight spotlight-right" aria-hidden="true"/><div className="scene-atmosphere" aria-hidden="true"/><WeatherEffects weather={state.weather?.id} reducedMotion={reducedMotion} event={playbackEvent}/>
        <div className="field-weather-effects" aria-hidden="true"><i className="field-psychic-wave"/><i className="field-psychic-wave"/><i className="field-psychic-wave"/><i className="field-electric-reflection"/><i className="field-electric-reflection"/></div>
        <div className="battlefield-platform platform-foe"><span /></div><div className="battlefield-platform platform-player"><span /></div>
        <div className="scene-formation formation-foe">{cpu.active.map((index, activeSlot) => <SceneActor key={cpu.team[index].uid} pokemon={cpu.team[index]} side="cpu" slot={activeSlot} event={playbackEvent} onTarget={sceneTarget('cpu', activeSlot)} targetPreview={previewFor(cpu.team[index].uid)} />)}</div>
        <div className="scene-formation formation-player">{player.active.map((index, activeSlot) => <SceneActor key={player.team[index].uid} pokemon={player.team[index]} side="player" slot={activeSlot} event={playbackEvent} commanding={!animating && !waitingOpponent && activeSlot === slot} onTarget={sceneTarget('player', activeSlot)} targetPreview={previewFor(player.team[index].uid)} />)}</div>
      </div>
      <BattleTargetOverlay sourceUid={active?.uid} targetUids={previewUids} spread={spreadPreview}/>
      <div className="status-stack status-stack-foe">{cpu.active.map((index, activeSlot) => <BattleStatusPlate key={cpu.team[index].uid} pokemon={cpu.team[index]} side="cpu" slot={activeSlot} event={playbackEvent} motion={animating && !reducedMotion} rate={playbackRate} />)}</div>
      <div className="status-stack status-stack-player">{player.active.map((index, activeSlot) => <BattleStatusPlate key={player.team[index].uid} pokemon={player.team[index]} side="player" slot={activeSlot} event={playbackEvent} motion={animating && !reducedMotion} rate={playbackRate} />)}</div>
      {animating && namedEvent && <div className={`stadium-move-callout stadium-move-${eventType}`} aria-hidden="true"><small>{eventActorSide} {eventActor?.speciesName ?? '포켓몬'} · {typeNames[eventType] ?? eventType}</small><strong>{moveEventLabel}</strong><span>{playbackEvent?.kind === 'move' ? '기술 사용' : playbackEvent?.kind === 'damage' ? '피해 적용' : '기술 결과'}</span></div>}
       {playbackEvent?.kind==='gimmick-transform' && ((playbackEvent.gimmick==='mega'||playbackEvent.gimmick==='dynamax'||playbackEvent.gimmick==='tera')||(playbackEvent.gimmick==='z'&&eventActor?.transformation?.formId==='necrozmaultra')) && <div className={`stadium-transform-spotlight ${eventActor?.transformation?.formId==='necrozmaultra'?'spotlight-ultra':`spotlight-${playbackEvent.gimmick}`} ${eventActor?.transformation?.formId?.endsWith('gmax')?'spotlight-gmax':''}`} role="status"><div className="spotlight-emblem"><Sparkles size={38} /></div><small>{eventActor?.transformation?.formId==='necrozmaultra'?'ULTRA BURST':eventActor?.transformation?.formId?.endsWith('gmax')?'GIGANTAMAX':playbackEvent.gimmick==='mega'?'MEGA EVOLUTION':playbackEvent.gimmick==='tera'?'TERASTALLIZATION':'DYNAMAX'}</small><strong>{eventActor?.speciesName}</strong><span>{eventActor?.transformation?.formId==='necrozmaultra'?'울트라네크로즈마로 변신':playbackEvent.gimmick==='mega'?`${abilities[eventActor?.set.abilityId??'']?.name??'특성'} 발동`:playbackEvent.gimmick==='tera'?`${typeNames[eventActor?.transformation?.teraType??'normal']} 타입으로 변화`:eventActor?.transformation?.formId?.endsWith('gmax')?'전용 거다이맥스 폼':'HP 2배 · 3턴'}</span></div>}
      <div className="battle-interface">
        <div className={`battle-message-box ${isMoveEvent ? 'battle-message-move' : ''}`} aria-live="polite" aria-atomic="true"><span className={`message-mark ${isMoveEvent ? `message-type-${eventType}` : ''}`}>{isMoveEvent ? <Swords size={18} /> : <Sparkles size={17} />}</span><div className="battle-message-content"><small className="message-kicker">{isMoveEvent ? `TURN ${String(playbackEvent?.snapshot.turn ?? state.turn).padStart(2, '0')} · 기술 사용` : animating ? '전투 상황' : friendMode ? '친선 배틀' : replacing ? '포켓몬 교체' : '배틀 메시지'}</small><p key={playbackEvent ? `${playbackEvent.snapshot.turn}-${playbackEvent.id}` : prompt}>{isMoveEvent ? `${eventActorSide} ${eventActor?.speciesName ?? '포켓몬'}의 ${moveEventLabel}!` : prompt}</p>{isMoveEvent && <div className="message-move-detail"><TypeBadge type={eventType} /><span>{eventCategory === 'physical' ? '물리 공격' : eventCategory === 'special' ? '특수 공격' : '변화 기술'}</span><span>{eventTargets.length ? `대상 · ${eventTargets.join(', ')}` : '자신에게 사용'}</span><small>{eventCue}</small></div>}</div><span className="message-cursor">▼</span></div>
        <fieldset className="battle-action-box" data-menu={menu} aria-label="전투 행동 선택" disabled={animating||waitingOpponent}>
           <div className="action-header"><span>{animating ? '기술 장면 재생 중' : waitingOpponent ? '친구의 행동을 기다리는 중' : replacing ? '출전 포켓몬 선택' : `${active?.speciesName ?? '포켓몬'}의 차례`}</span>{state.format === 'doubles' && <div className="action-actors">{player.active.map((index, activeSlot) => <button key={activeSlot} disabled={replacing ? !replacementSlots(state, 'player').includes(activeSlot) : player.team[index].fainted} className={slot === activeSlot ? 'selected' : ''} onClick={() => { setEventMessage(null); setSlot(activeSlot); setMenu(replacing ? 'party' : 'root'); setTargetMove(null); }}>{replacing ? `${activeSlot + 1}번 자리` : player.team[index].speciesName}{pending.some(action => action.slot === activeSlot) && <Check size={12} />}</button>)}</div>}</div>
          {animating && <div className="turn-playback-indicator"><span className="playback-pulse" /><strong>{namedEvent ? `${eventActorSide} ${eventActor?.speciesName}` : '배틀 진행 중'}</strong><small>{namedEvent ? moveEventLabel : '실제 전투 결과를 순서대로 재생합니다.'}</small><div className="action-timeline" aria-hidden="true"><i data-phase="announce">기술명</i><i data-phase="cast">시전</i><i data-phase="impact">피격</i><i data-phase="hp">HP</i><i data-phase="result">효과</i></div></div>}
          {state.winner ? <div className="battle-result-actions"><strong>{state.winner === 'player' ? (friendMode ? '친선전 승리!' : '승리!') : state.winner === 'cpu' ? (friendMode ? '친선전 패배' : '패배') : '무승부'}</strong><button className="game-choice game-choice-confirm" onClick={onRematch}><RotateCcw size={15} /> {friendMode&&friendRole==='guest'?'재대전 요청':'다시 대전'}</button></div> : <>
             {!replacing&&(menu==='root'||menu==='moves')&&active&&<div className="gimmick-controls" aria-label="배틀 기믹"><small>{player.gimmick?.used?`사용 완료: ${gimmickNames[player.gimmick.kind!]}`:selectedGimmick?`${gimmickNames[selectedGimmick]} · 기술과 함께 발동`:'특별한 힘'}</small><div>{(['mega','tera','z','dynamax'] as const).map(kind=>{const reason=forcedMoveId?'연속 사용 중에는 기믹을 선택할 수 없습니다.':reservedGimmick?'다른 출전 포켓몬에 기믹이 예약되어 있습니다.':gimmickReason(state,'player',active,kind);return <button key={kind} data-gimmick={kind} disabled={!!reason} title={reason??'선택 또는 취소'} aria-pressed={selectedGimmick===kind} onClick={()=>{setGimmickSelection(previous=>({...previous,[slot]:selectedGimmick===kind?undefined:kind}));setEventMessage(null);setMenu('moves');}}>{gimmickNames[kind]}{kind==='dynamax'&&active.set.gigantamax?' / 거다이':''}</button>;})}</div>{selectedGimmick==='tera'&&<span className="battle-tera-select">지닌 도구의 테라 타입 · {typeNames[selectedTeraType]}</span>}</div>}
             {menu === 'root' && !replacing && <div className="root-actions"><button className="game-choice game-choice-fight" onClick={() => { setEventMessage(null); setMenu('moves'); }}><Swords size={17} /> 싸운다</button><button className="game-choice" disabled={!!forcedMoveId} onClick={() => { setEventMessage(null); setMenu('party'); }}><Users size={17} /> 포켓몬</button><button className="game-choice" onClick={() => { setEventMessage(null); setMenu('bag'); }}><Shield size={17} /> 가방</button><button className="game-choice game-choice-disabled" disabled title="트레이너 대전에서는 도망갈 수 없습니다."><ArrowRight size={17} /> 도망간다</button></div>}
            {replacing && menu === 'root' && !allReady && <button className="game-choice" onClick={() => setMenu('party')}>다음 포켓몬 선택</button>}
            {menu === 'moves' && <div className="move-actions">{active&&alphabetizeMoves(active.set.moves).map(moveId=>{const unavailable=moveUnavailableReason(actionPokemon,moveId,selectedGimmick==='z')??(selectedGimmick==='z'?gimmickReason(state,'player',active,'z',moveId):undefined);const move=battleMovePreview(weatherBallMove(state,active,previewMove(active,moves[moveId],selectedGimmick==='z'&&unavailable?undefined:selectedGimmick,selectedTeraType)));const shownMove=(move.dynamicPower||move.id==='expandingforce'&&state.field?.id==='psychic'&&isGrounded(active,state))&&selectedGimmick!=='z'?{...move,power:dynamicMovePower(state,active,move.power,move)}:move;return <MoveChoice key={moveId} move={shownMove} baseId={moveId} pp={active.pp[moveId]} unavailable={unavailable} effectiveness={foeTargets.length===1?effectivenessLabel(move,cpu.team[cpu.active[foeTargets[0].slot]]):undefined} onChoose={()=>selectMove(moveId)} onPreview={show=>setHoverMove(show?moveId:null)}/>;})}{active && isMoveUsable(active, 'struggle') && <button className="struggle-choice" disabled={animating} onClick={() => selectMove('struggle')}><span className="move-name">발버둥</span><TypeBadge type="normal" /><span className="move-power">반동 피해</span><small>PP —</small></button>}<button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            {menu === 'party' && <div className="party-actions">{player.team.map((pokemon, index) => { const reserved = pending.some(action => action.kind === 'switch' && action.to === index && action.slot !== slot); const trapped = !!active?.trapped && active.set.itemId!=='shedshell' && !replacing; const disabled = pokemon.fainted || player.active.includes(index) || reserved || trapped; return <button key={pokemon.uid} disabled={disabled || animating} onClick={() => queueAction({ kind: 'switch', slot, to: index })}><SpeciesMark speciesId={pokemon.set.speciesId} className="party-mark" /><span><strong>{pokemon.speciesName}</strong><small>{pokemon.fainted ? '기절' : reserved ? '출전 예약' : trapped ? '교체 불가' : disabled ? '전투 중' : `HP ${pokemon.hp}/${pokemon.maxHp}`}</small><HpBar pokemon={pokemon} /></span></button>; })}{!replacing && <button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button>}</div>}
            {menu === 'bag' && <div className="bag-actions"><div className="bag-empty"><Shield size={22} /><span>{active?.speciesName} · {active ? items[active.set.itemId]?.name : '없음'}{active?.itemConsumed ? ' (소모됨)' : ''}</span><small>{active?.itemConsumed ? '이번 배틀에서 이미 사용한 지닌 도구입니다.' : active ? items[active.set.itemId]?.description : ''}</small><small>지닌 도구는 자동 발동합니다. 가방 소모품은 지원하지 않습니다.</small></div><button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            {menu === 'targets' && targetMove && <div className="target-actions">{targetsFor(targetMove).map(ref => { const target = state.sides[ref.side].team[state.sides[ref.side].active[ref.slot]]; return <button key={`${ref.side}-${ref.slot}`} onMouseEnter={()=>setHoverTarget(ref)} onMouseLeave={()=>setHoverTarget(null)} onFocus={()=>setHoverTarget(ref)} onBlur={()=>setHoverTarget(null)} onClick={() => queueAction({ kind: 'move', slot, moveId: targetMove, target: ref })}><Target size={15} /><span>{ref.side === 'cpu' ? '상대' : '아군'} · {target.speciesName}</span><small>{moves[targetMove]?effectivenessLabel(weatherBallMove(state,active,previewMove(active,moves[targetMove],selectedGimmick,selectedTeraType)),target):"Lv. 50"}</small></button>; })}<button className="game-choice action-back" onClick={backMenu}><ArrowLeft size={14} /> 돌아가기</button></div>}
            <div className="action-footer">{pending.length > 0 && <span className="queued-actions">{pending.map(action => <button key={action.slot} className="queued-choice" title="예약 행동 수정" onClick={()=>{setSlot(action.slot);setMenu(replacing?"party":"moves");setTargetMove(null);}}>{player.team[player.active[action.slot]]?.speciesName}: {queuedLabel(action)}{action.kind==="move"&&action.target?` → ${state.sides[action.target.side].team[state.sides[action.target.side].active[action.target.slot]]?.speciesName}`:""}</button>)}</span>}{pending.some(action => action.slot === slot) && <button className="game-choice action-cancel" onClick={cancelAction}>행동 취소</button>}{allReady ? <button className="game-choice game-choice-confirm" disabled={animating} onClick={() => onTurn(pending)}>{animating ? '진행 중…' : '행동 결정'} <ArrowRight size={15} /></button> : !pending.some(action => action.slot === slot) && <span className="choose-next">{replacing ? '출전할 포켓몬을 선택하세요.' : state.format === 'doubles' && pending.length ? '다음 포켓몬의 행동을 선택하세요.' : '행동을 선택하세요.'}</span>}</div>
          </>}
        </fieldset>
      </div>
      {showDetails&&<div className="battle-details" role="dialog" aria-label="전장과 기술 설명"><button className="details-close" aria-label="설명 닫기" onClick={()=>setShowDetails(false)}><X size={18}/></button>{details}</div>}{showLog && <div className={`battle-history ${compactLog ? 'battle-history-compact' : ''}`}><div className="history-heading"><strong>전투 기록</strong><button onClick={() => setShowLog(false)} aria-label="기록 닫기"><X size={16} /></button></div><div ref={logRef} className="history-lines">{state.log.map((entry, index) => <p key={index}><small>{String(entry.turn).padStart(2, '0')}</small>{entry.text}</p>)}</div></div>}
      {state.winner && !animating && <div className="battle-result-overlay" role="dialog" aria-label="배틀 결과"><div><span>{friendMode ? 'FRIEND MATCH' : 'BATTLE COMPLETE'}</span><h1>{state.winner === 'player' ? '승리!' : state.winner === 'cpu' ? '패배' : '무승부'}</h1><p>{state.winner === 'player' ? '멋진 승부였어요. 다음 배틀도 준비됐나요?' : '이번 배틀의 기록을 확인하고 다시 도전해 보세요.'}</p><div><button className="game-choice game-choice-confirm" onClick={onRematch}><RotateCcw size={16} />{friendMode && friendRole === 'guest' ? '재대전 요청' : '다시 대전'}</button><button className="game-choice" onClick={() => setShowLog(true)}><BookOpen size={16} />전투 기록 보기</button><button className="game-choice" onClick={onExit}>메인 메뉴</button></div></div></div>}
    </div>
  </main>;
}

export default function App() {
  const spriteLibrary = useSpriteLibrary();
  const spriteDiagnostics = useSpriteDiagnostics();
  const frontCount = Object.keys(spriteLibrary).filter(key => key.startsWith('front/')).length;
  const [screen, setScreen] = useState<Screen>(() => new URLSearchParams(location.search).has('friendCode') ? 'friendly' : 'home');
  const [team, setTeam] = useState<TeamSet[]>(() => { try { return loadTeam() ?? createDefaultTeam(); } catch { return createDefaultTeam(); } });
  const [battle, setBattle] = useState<BattleState | null>(null);
  const battleRef = useRef<BattleState | null>(null);
  const [friendRoom, setFriendRoom] = useState<import('./components/FriendlyLobby').FriendRoomView | null>(null);
  const friendRoomRef = useRef<import('./components/FriendlyLobby').FriendRoomView | null>(null);
  const friendSocket = useRef<WebSocket | null>(null);
  const friendIdentity = useRef({ role: 'host' as 'host' | 'guest', name: '트레이너' });
  const friendLocalTeam = useRef<TeamSet[]>([]);
  const [friendStatus, setFriendStatus] = useState('');
  const [friendConnecting, setFriendConnecting] = useState(false);
  const [friendWaiting, setFriendWaiting] = useState(false);
  const [friendOnline, setFriendOnline] = useState(false);
  const [friendPreview,setFriendPreview] = useState<TeamPreviewState|null>(null);
  const [cpuPreview,setCpuPreview] = useState<{format:Format;own:TeamSet[];opponent:TeamSet[];endsAt:number}|null>(null);
  const [format, setFormat] = useState<Format>('singles');
  const [restrictedLimit,setRestrictedLimit]=useState<RestrictedLimit>(4);
  const [message, setMessage] = useState('');
  const [animating, setAnimating] = useState(false);
  const [playbackEvent, setPlaybackEvent] = useState<BattleEvent | null>(null);
  const playbackController = useRef<AbortController | null>(null);
  const playbackLocked = useRef(false);
  const skipRequested = useRef(false);
  const guestGeneration = useRef(0);
  const friendRevision=useRef(0);
  const reconnectTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const connectionDeadline=useRef(0);
  const autoReplacementKey = useRef('');
  useEffect(() => { void initializeSprites(); return () => playbackController.current?.abort(); }, []);
  useEffect(() => { battleRef.current = battle; }, [battle]);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('arena-reduced-motion') === 'true');
  const [compactLog, setCompactLog] = useState(() => localStorage.getItem('arena-compact-log') === 'true');
  const [playbackRate, setPlaybackRate] = useState(() => { const saved = Number(localStorage.getItem('arena-playback-rate')); return [.75, 1, 1.5].includes(saved) ? saved : 1; });
  const [sound, setSound] = useState(() => localStorage.getItem('arena-sound') !== 'false');
  useEffect(() => { localStorage.setItem('arena-playback-rate', String(playbackRate)); }, [playbackRate]);
  useEffect(() => { localStorage.setItem('arena-sound', String(sound)); battleAudio.enabled = sound; }, [sound]);
  useEffect(()=>{battleAudio.setVolume('effects',Number(localStorage.getItem('arena-effects-volume')??.65));battleAudio.setVolume('music',Number(localStorage.getItem('arena-music-volume')??.3));},[]);
  useEffect(() => { localStorage.setItem('arena-reduced-motion', String(reducedMotion)); }, [reducedMotion]);
  useEffect(() => { localStorage.setItem('arena-compact-log', String(compactLog)); }, [compactLog]);
  function startBattle(nextFormat: Format) {
    cancelPlayback(); battleAudio.unlock();
    const issues = [...validateTeam(team, nextFormat),...validateRestrictedTeam(team,restrictedLimit,nextFormat)];
    if (issues.length) { setMessage(issues[0]); setScreen('team'); return; }
    try {
      const opponents=[...restrictedCpuSpecies.slice(0,restrictedLimit),...cpuSpecies.slice(restrictedLimit)];
      const cpuTeam = opponents.map(id => ({...createSet(id),itemId:id==='tyranitar'?'tyranitarite':id==='lucario'?'fightiniumz':'none',teraType:id==='tyranitar'?'flying':species[id].types[0]}));
      setCpuPreview({format:nextFormat,own:structuredClone(team),opponent:cpuTeam,endsAt:Date.now()+90_000});
      setFriendPreview(null);
      setFriendOnline(false);
      setPlaybackEvent(null); setFormat(nextFormat); setMessage(''); setScreen('preview');
    } catch (error) { setMessage(error instanceof Error ? error.message : '배틀을 시작하지 못했습니다.'); }
  }
  function submitCpuPreview(selection:TeamSelectionPayload){
    if(!cpuPreview)return;
    const required=Math.min(cpuPreview.format==='doubles'?4:3,cpuPreview.own.length);
    if(selection.indices.length!==required||new Set(selection.indices).size!==required||selection.indices.some(index=>!Number.isInteger(index)||index<0||index>=cpuPreview.own.length))return;
    try{
      const initial=createBattle({format:cpuPreview.format,playerTeam:selection.indices.map(index=>cpuPreview.own[index]),
        cpuTeam:cpuPreview.opponent.slice(0,required),manualReplacementSides:['player']});
      battleRef.current=initial;setBattle(initial);setCpuPreview(null);setScreen('intro');
    }catch(error){setMessage(error instanceof Error?error.message:'배틀을 시작하지 못했습니다.');}
  }
  async function runBattleTurn(actions: BattleAction[]) {
    const current = battleRef.current ?? battle;
    if (!current || playbackLocked.current || current.winner) return;
    playbackLocked.current = true;
    setAnimating(true);
    setFriendWaiting(false);
    const controller = new AbortController(); playbackController.current = controller;
    skipRequested.current = false;
    try {
      const result = runTurnWithEvents(current, actions);
      await playEvents(result.events, {
        present: event => {
          flushSync(() => { battleRef.current = event.snapshot; setBattle(event.snapshot); setPlaybackEvent(event); });
        },
        animate: (event, signal) => animateBattleEvent(document.querySelector('.battle-scene'), event, signal, reducedMotion),
        minDurationMs: event => playbackDuration(event, reducedMotion, playbackRate),
        recover: () => setMessage('연출을 건너뛰고 실제 전투 결과로 복구했습니다.'),
      }, controller.signal);
      if (!controller.signal.aborted || skipRequested.current) {
        flushSync(() => { battleRef.current = result.state; setBattle(result.state); setPlaybackEvent(null); });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '턴 처리 중 오류가 발생했습니다.'); }
    finally { if (playbackController.current === controller) { playbackLocked.current = false; setAnimating(false); } }
  }
  function cancelPlayback() {
    skipRequested.current = false; playbackController.current?.abort(); playbackController.current = null;
    guestGeneration.current += 1;
    playbackLocked.current = false; setAnimating(false); setPlaybackEvent(null); autoReplacementKey.current = '';
    resetBattleVisuals(document.querySelector('.battle-scene'));
  }
  function skipPlayback() {
    if(friendOnline){sendFriend({type:'skip-playback'});return;}
    skipRequested.current=true;playbackController.current?.abort();
  }
  async function playFriendTurn(result:Extract<FriendMessage,{type:'turn-resolved'}>) {
    cancelPlayback();friendRevision.current=result.revision;
    const controller=new AbortController();playbackController.current=controller;playbackLocked.current=true;
    setAnimating(true);setFriendWaiting(true);
    const rate=[.75,1,1.5].includes(result.rate)?result.rate:1;setPlaybackRate(rate);
    try {
      await playEvents(result.events,{
        present:event=>flushSync(()=>{battleRef.current=event.snapshot;setBattle(event.snapshot);setPlaybackEvent(event);}),
        animate:(event,signal)=>animateBattleEvent(document.querySelector('.battle-scene'),event,signal,reducedMotion),
        minDurationMs:event=>playbackDuration(event,reducedMotion,rate),
      },controller.signal);
      if(!controller.signal.aborted){flushSync(()=>{battleRef.current=result.state;setBattle(result.state);setPlaybackEvent(null);});setAnimating(false);playbackLocked.current=false;sendFriend({type:'playback-ready',revision:result.revision});}
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'배틀 재생 오류');}
  }
  function sendFriend(message: FriendOutgoing) {
    if (friendSocket.current?.readyState === WebSocket.OPEN) friendSocket.current.send(JSON.stringify(message));
  }
  function closeFriendRoom() {
    cancelPlayback();
    clearTimeout(reconnectTimer.current);sessionStorage.removeItem('arena-friend-session');connectionDeadline.current=0;
    sendFriend({ type: 'leave-room' });
    friendSocket.current?.close(); friendSocket.current = null;
    friendRoomRef.current = null; setFriendRoom(null); setFriendStatus(''); setFriendConnecting(false); setFriendWaiting(false); setFriendOnline(false);setFriendPreview(null);
    if (battleRef.current) { setBattle(null); battleRef.current = null; setPlaybackEvent(null); setAnimating(false); setScreen('home'); }
    else setScreen('home');
  }
  function beginFriendConnection(mode: 'create' | 'join' | 'resume', name: string, roomCode?: string) {
    const saved=JSON.parse(sessionStorage.getItem('arena-friend-session')??'null') as {role:'host'|'guest';name:string;code:string;token:string}|null;
    if(mode!=='resume'){const issues=validateTeam(team,'singles');if(issues.length){setMessage(issues[0]);setScreen('team');return;}connectionDeadline.current=0;}
    if(mode==='resume'&&!saved)return;
    friendSocket.current?.close();
    friendIdentity.current = { role: mode==='resume'?saved!.role:mode==='create'?'host':'guest', name: name.trim().slice(0, 18) || '트레이너' };
    friendLocalTeam.current = structuredClone(team);
    setFriendConnecting(true); setFriendStatus('친구 대전 서버에 연결하고 있습니다…'); setMessage('');
    const socket = new WebSocket(friendSocketUrl()); friendSocket.current = socket;
    socket.onopen=()=>socket.send(JSON.stringify(mode==='resume'?{type:'resume-room',code:saved!.code,token:saved!.token}:mode==='create'?{type:'create-room'}:{type:'join-room',code:roomCode}));
    socket.onmessage = event => {
      if (friendSocket.current !== socket) return;
      let message: FriendMessage;
      try { message = JSON.parse(String(event.data)) as FriendMessage; }
      catch { setFriendStatus('서버 응답을 읽지 못했습니다.'); return; }
      if (message.type === 'room-created' || message.type === 'room-joined') {
        sessionStorage.setItem('arena-friend-session',JSON.stringify({code:message.code,role:message.role,token:message.token,name:friendIdentity.current.name}));connectionDeadline.current=0;
        const next = { role: message.role, code: message.code, name: friendIdentity.current.name } as const;
        friendRoomRef.current = next; setFriendRoom(next); setFriendConnecting(false); setFriendStatus('친구를 기다리고 있습니다…');
        socket.send(JSON.stringify({ type: 'ready', name: friendIdentity.current.name, team: friendLocalTeam.current,format }));
        if(message.role==='host')socket.send(JSON.stringify({type:'select-format',format,allowRestricted:restrictedLimit>0,restrictedLimit}));
      } else if(message.type==='room-resumed') {
        cancelPlayback();connectionDeadline.current=0;friendRevision.current=message.revision;setFormat(message.state?.format??message.format??'singles');setRestrictedLimit(message.restrictedLimit??(message.allowRestricted?1:0));
        const next={role:message.role,code:message.code,name:message.profile?.name??friendIdentity.current.name,peer:message.peer};friendRoomRef.current=next;setFriendRoom(next);
        if(message.profile)friendLocalTeam.current=message.profile.team;
        else socket.send(JSON.stringify({type:'ready',name:friendIdentity.current.name,team:friendLocalTeam.current,format}));
        setFriendConnecting(false);setFriendWaiting(message.waiting);setFriendStatus(message.peerConnected?'친선전 연결을 복구했습니다.':'친구의 재접속을 기다립니다. 최대 2분 동안 방을 유지합니다.');
        if(message.state){battleRef.current=message.state;setBattle(message.state);setFriendPreview(null);setFriendOnline(true);setFormat(message.state.format);setScreen('battle');}
        else if(message.preview){setFriendPreview(message.preview);setScreen('preview');}
        else setScreen('friendly');
      } else if (message.type === 'peer-joined') setFriendStatus('친구가 방에 들어왔어요. 팀을 연결하고 있습니다…');
      else if(message.type==='format-selected'){setFormat(message.format);setRestrictedLimit(message.restrictedLimit??(message.allowRestricted?1:0));}
      else if (message.type === 'peer-ready') {
        const next = { ...friendRoomRef.current!, peer: message.peer };
        friendRoomRef.current = next; setFriendRoom(next); setFriendStatus(`${message.peer.name}과 연결됐습니다. ${format==='doubles'?'더블':'싱글'} 친선전을 시작할 수 있어요.`);
      } else if(message.type==='team-preview-started'){
        setFriendPreview(message);setCpuPreview(null);setFormat(message.format);setRestrictedLimit(message.restrictedLimit??(message.allowRestricted?1:0));setFriendWaiting(false);setScreen('preview');
      } else if(message.type==='team-selection-status'){
        setFriendPreview(current=>current?{...current,...(message.role===friendIdentity.current.role?{submitted:message.submitted}:{opponentSubmitted:message.submitted})}:current);
      } else if (message.type === 'battle-started') {
        cancelPlayback();friendRevision.current=message.revision;
        battleRef.current=message.state;setBattle(message.state);setFormat(message.state.format);setFriendPreview(null);setFriendOnline(true);setFriendWaiting(false);setScreen('intro');
        setFriendStatus('서버 판정 친선 배틀을 시작했습니다.');
      } else if(message.type==='turn-resolved') {void playFriendTurn(message);}
      else if(message.type==='actions-accepted'){setFriendWaiting(true);}
      else if(message.type==='round-ready'||message.type==='turn-complete') {
        cancelPlayback();friendRevision.current=message.revision;battleRef.current=message.state;setBattle(message.state);setFriendWaiting(false);
      } else if(message.type==='rematch-state') {
        cancelPlayback();friendRevision.current=message.revision;battleRef.current=message.state;setBattle(message.state);setFormat(message.state.format);setFriendWaiting(false);setScreen('intro');
      } else if (message.type === 'rematch-request') setMessage('친구가 재대전을 요청했습니다. 다시 대전 버튼을 눌러 새 경기를 시작하세요.');
      else if(message.type==='peer-left'){setFriendStatus('친구 연결이 끊겼습니다. 최대 2분 동안 재접속을 기다립니다.');setMessage('친구의 연결을 복구하는 중입니다. 새로고침해도 배틀을 이어갈 수 있습니다.');}
      else if(message.type==='peer-reconnected'){setFriendStatus('친구가 다시 연결됐습니다.');setMessage('친구의 연결이 복구됐습니다.');}
      else if(message.type==='room-left'){closeFriendRoom();setFriendStatus('방이 종료되었습니다.');}
      else if(message.type==='error'){setFriendConnecting(false);setFriendWaiting(false);setFriendStatus(message.message);setMessage(message.message);if(mode==='resume'){sessionStorage.removeItem('arena-friend-session');connectionDeadline.current=0;setFriendOnline(false);setScreen('friendly');}}
    };
    socket.onerror = () => { setFriendConnecting(false); setFriendStatus('연결에 실패했습니다. 릴레이 서버와 주소를 확인해 주세요.'); };
    socket.onclose=()=>{
      if(friendSocket.current!==socket||!sessionStorage.getItem('arena-friend-session'))return;
      cancelPlayback();setFriendWaiting(true);setFriendConnecting(true);setFriendStatus('연결 복구 중… 최대 2분 동안 자동 재접속합니다.');
      connectionDeadline.current ||= Date.now()+120000;
      if(Date.now()<connectionDeadline.current){clearTimeout(reconnectTimer.current);reconnectTimer.current=setTimeout(()=>beginFriendConnection('resume',friendIdentity.current.name),1500);}
      else {setFriendConnecting(false);setMessage('재접속 시간이 지났습니다. 친선전 방을 다시 만들어 주세요.');}
    };
  }
  function startFriendBattle(nextFormat:Format) {
    battleAudio.unlock();const room=friendRoomRef.current;if(!room?.peer||room.role!=='host')return;
    const localIssues=[...validateTeam(team,nextFormat),...validateRestrictedTeam(team,restrictedLimit,nextFormat)];
    if(localIssues.length||team.length!==6||room.peer.team.length!==6){setFriendStatus(localIssues[0]??'양쪽 모두 6마리 팀이 필요합니다.');return;}
    setFormat(nextFormat);sendFriend({type:'playback-rate',rate:playbackRate});sendFriend({type:'start_team_preview',format:nextFormat,allowRestricted:restrictedLimit>0,restrictedLimit});
  }
  function chooseFriendFormat(nextFormat:Format){
    setFormat(nextFormat);
    const nextLimit:RestrictedLimit=restrictedLimit;
    const room=friendRoomRef.current;
    if(room?.role==='host')sendFriend({type:'select-format',format:nextFormat,allowRestricted:nextLimit>0,restrictedLimit:nextLimit});
  }
  function chooseRestricted(limit:RestrictedLimit){setRestrictedLimit(limit);const room=friendRoomRef.current;if(room?.role==='host')sendFriend({type:'select-format',format,allowRestricted:limit>0,restrictedLimit:limit});}
  function submitBattleActions(actions: BattleAction[]) {
    battleAudio.unlock();
    if (!friendOnline) { void runBattleTurn(actions); return; }
    const mapped=friendIdentity.current.role==='guest'?swapTargetSides(actions):actions;
    if(friendIdentity.current.role==='host')sendFriend({type:'playback-rate',rate:playbackRate});sendFriend({type:'actions',actions:mapped,revision:friendRevision.current});setFriendWaiting(true);
  }
  function requestRematch() {
    if(!friendOnline){startBattle(format);return;}
    if(friendIdentity.current.role==='guest'){sendFriend({type:'rematch-request'});setMessage('호스트에게 재대전 요청을 보냈습니다.');return;}
    sendFriend({type:'rematch-state'});
  }
  useEffect(()=>{
    const saved=sessionStorage.getItem('arena-friend-session');if(saved){try{const info=JSON.parse(saved);beginFriendConnection('resume',info.name);}catch{sessionStorage.removeItem('arena-friend-session');}}
    return ()=>{clearTimeout(reconnectTimer.current);const socket=friendSocket.current;friendSocket.current=null;socket?.close();};
  },[]);
  function addFromDex(id: string) {
    const existing = team.findIndex(set => set.speciesId === id);
    if (existing >= 0) { setMessage(`${species[id].name}은 이미 팀에 있습니다.`); setScreen('team'); return; }
    if (team.length >= 6) { setMessage('팀이 가득 찼습니다. 팀 편성에서 기존 포켓몬을 변경하세요.'); setScreen('team'); return; }
    setTeam([...team, createSet(id)]); setMessage(`${species[id].name}을 팀에 추가했습니다.`); setScreen('team');
  }
  function exitCurrentBattle() { cancelPlayback(); if (friendOnline) { closeFriendRoom(); return; } setBattle(null); battleRef.current = null; setScreen('home'); }
  const guestView = friendOnline && friendIdentity.current.role === 'guest';
  const displayedBattle = battle ? guestView ? swapBattleSides(battle) : battle : null;
  const displayedEvent = playbackEvent && guestView ? swapBattleEvent(playbackEvent) : playbackEvent;
  useEffect(() => {
    if (!friendOnline || animating || friendWaiting || !battle || !needsReplacement(battle)) return;
    const side = friendIdentity.current.role === 'guest' ? 'cpu' : 'player';
    if (replacementSlots(battle, side).length) return;
    const key = `${battle.turn}:${battle.sides.player.active.join(',')}:${battle.sides.cpu.active.join(',')}`;
    if (autoReplacementKey.current === key) return;
    autoReplacementKey.current = key;
    submitBattleActions([]);
  }, [battle, animating, friendOnline, friendWaiting]);
  const displayNames = friendIdentity.current.role === 'guest'
    ? { player: friendRoom?.name ?? '나', opponent: friendRoom?.peer?.name ?? '친구' }
    : { player: friendRoom?.name ?? '나', opponent: friendRoom?.peer?.name ?? '친구' };
  return <div className={`app-shell ${reducedMotion ? 'reduced-motion' : ''} ${screen === 'battle' ? 'app-shell-battle' : ''} ${screen === 'intro' ? 'app-shell-intro' : ''}`}>{screen !== 'battle'&&screen!=='intro'&&screen!=='preview' && <Header screen={screen} onNavigate={setScreen} />}{message && <div className="global-message" role="alert">{message}<button onClick={() => setMessage('')} aria-label="알림 닫기"><X size={16} /></button></div>}
    {screen !== 'battle'&&screen!=='intro'&&screen!=='preview' && spriteDiagnostics.phase==='ready' && frontCount < Object.keys(regulationSpecies).length && <div className="artwork-notice"><span><strong>이미지 라이브러리 미완성</strong> · 정면 {frontCount}/{Object.keys(regulationSpecies).length}종. 누락된 이미지는 종 이름과 대체 그림으로 표시합니다.</span><button onClick={() => setScreen('settings')}>이미지 가져오기</button></div>}
    {screen === 'home' && <Home team={team} restrictedLimit={restrictedLimit} onRestricted={chooseRestricted} onStart={startBattle} onNavigate={setScreen} onFriend={() => setScreen('friendly')} />}
    {screen === 'team' && <TeamBuilder team={team} setTeam={setTeam} onStart={startBattle} />}
    {screen === 'friendly' && <FriendlyLobby room={friendRoom} status={friendStatus} connecting={friendConnecting} team={team} format={format} restrictedLimit={restrictedLimit} onRestricted={chooseRestricted} onFormat={chooseFriendFormat} onCreate={name => beginFriendConnection('create', name)} onJoin={(name, code) => beginFriendConnection('join', name, code)} onStart={()=>startFriendBattle(format)} onLeave={closeFriendRoom} onHome={() => setScreen('home')} />}
    {screen === 'preview' && friendPreview && <TeamPreviewModal format={friendPreview.format} own={friendPreview.own} opponent={friendPreview.opponent} endsAt={friendPreview.endsAt} submitted={friendPreview.submitted} opponentSubmitted={friendPreview.opponentSubmitted} opponentName={friendRoom?.peer?.name??'상대'} onSubmit={selection=>sendFriend({type:'submit_team_selection',...selection})} onExit={closeFriendRoom}/>}
    {screen === 'preview' && !friendPreview && cpuPreview && <TeamPreviewModal format={cpuPreview.format} own={previewRoster(cpuPreview.own)} opponent={previewRoster(cpuPreview.opponent)} endsAt={cpuPreview.endsAt} submitted={false} opponentSubmitted={true} opponentName="CPU 라이벌" onSubmit={submitCpuPreview} onExit={()=>{setCpuPreview(null);setScreen('home');}} onTimeout={()=>submitCpuPreview({indices:Array.from({length:Math.min(cpuPreview.format==='doubles'?4:3,cpuPreview.own.length)},(_,index)=>index)})}/>}
    {screen === 'dex' && <Dex onAdd={addFromDex} team={team} onRemove={id => { if (team.length > 1) setTeam(team.filter(set => set.speciesId !== id)); else setMessage('팀에 최소 한 마리는 남겨야 합니다.'); }} />}
    {screen === 'settings' && <Settings reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} compactLog={compactLog} setCompactLog={setCompactLog} />}
    {screen === 'intro'&&battle&&<BattleIntro state={friendOnline&&guestView?swapBattleSides(battle):battle} names={friendOnline?displayNames:{player:'나',opponent:'CPU 라이벌'}} friend={friendOnline} reducedMotion={reducedMotion} onStart={()=>setScreen('battle')}/>}
    {screen === 'battle' && displayedBattle && <Battle state={displayedBattle} onTurn={submitBattleActions} onRematch={requestRematch} onExit={exitCurrentBattle} compactLog={compactLog} animating={animating} playbackEvent={displayedEvent} friendMode={friendOnline} friendRole={friendOnline ? friendIdentity.current.role : null} friendNames={displayNames} waitingOpponent={friendWaiting} reducedMotion={reducedMotion} playbackRate={playbackRate} setPlaybackRate={setPlaybackRate} sound={sound} setSound={setSound} onSkip={skipPlayback} />}
    {screen !== 'battle'&&screen!=='intro'&&screen!=='preview' && <footer className="site-footer"><span>ARENA / BATTLE LAB</span><span>비공식 팬 제작 배틀 · 사용자 이미지 라이브러리</span><span>© {new Date().getFullYear()} ARENA</span></footer>}
  </div>;
}
