const fs=require('node:fs');const p='src/App.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("  const [speciesMode, setSpeciesMode]", "  const [rosterType, setRosterType] = useState('all');\n  const [speciesMode, setSpeciesMode]");
s=s.replace("  const filtered = Object.values(species).filter(item => item.name.includes(query) || item.id.includes(query.toLowerCase()));", "  const filtered = Object.values(species).filter(item => (item.name.includes(query.trim()) || item.id.includes(query.trim().toLowerCase()) || String(item.nationalDex) === query.trim()) && (rosterType === 'all' || item.representativeType === rosterType));");
s=s.replace('<div className="species-list">{filtered.map', '<label className="roster-category">대표 타입<select aria-label="편성 대표 타입" value={rosterType} onChange={event => setRosterType(event.target.value)}><option value="all">전체 {Object.keys(species).length}종</option>{Object.keys(typeNames).map(type => <option key={type} value={type}>{typeNames[type]} · 10종</option>)}</select><span>{filtered.length}종 표시</span></label><div className="species-list">{filtered.map');
s=s.replace('<small>{entry.id}</small>', '<small>#{entry.nationalDex} · {entry.englishName}</small>');
s=s.replace("function Dex({ onAdd }: { onAdd: (id: string) => void })", "function Dex({ onAdd, onRemove, team }: { onAdd: (id: string) => void; onRemove: (id:string) => void; team: TeamSet[] })");
s=s.replace("(typeFilter === 'all' || mon.types.includes(typeFilter))", "(typeFilter === 'all' || mon.representativeType === typeFilter)");
s=s.replace('<select value={typeFilter}', '<select aria-label="도감 대표 타입" value={typeFilter}');
s=s.replace('<option value="all">전체 타입</option>', '<option value="all">대표 타입 전체 · 180종</option>');
s=s.replace('<option key={type} value={type}>{typeNames[type]}</option>', '<option key={type} value={type}>{typeNames[type]} · 10종</option>');
s=s.replace('<div className="dex-meta"><span>종족값 합계</span>', '<dl className="dex-stats">{statKeys.map(stat => <div key={stat}><dt>{statNames[stat]}</dt><dd>{mon.baseStats[stat]}</dd></div>)}</dl><div className="dex-meta"><span>종족값 합계</span>');
s=s.replace('<button onClick={() => onAdd(mon.id)}>팀에 추가 <ArrowRight size={15} /></button>', '<button onClick={() => team.some(set => set.speciesId === mon.id) ? onRemove(mon.id) : onAdd(mon.id)}>{team.some(set => set.speciesId === mon.id) ? \'팀에서 제외\' : \'팀에 추가\'} <ArrowRight size={15} /></button>');
s=s.replace("{screen === 'dex' && <Dex onAdd={addFromDex} />}", "{screen === 'dex' && <Dex onAdd={addFromDex} team={team} onRemove={id => { if (team.length > 1) setTeam(team.filter(set => set.speciesId !== id)); else setMessage('팀에 최소 한 마리는 남겨야 합니다.'); }} />}");
s=s.replace('  const [screen, setScreen]', '  const spriteLibrary = useSpriteLibrary();\n  const frontCount = Object.keys(spriteLibrary).filter(key => key.startsWith(\'front/\')).length;\n  const [screen, setScreen]');
s=s.replace("    {screen === 'home' && <Home", "    {screen !== 'battle' && frontCount < Object.keys(species).length && <div className=\"artwork-notice\"><span><strong>이미지 라이브러리 미완성</strong> · 정면 {frontCount}/{Object.keys(species).length}종. 현재는 이름으로 구분하는 전투 검증 모드입니다.</span><button onClick={() => setScreen('settings')}>이미지 가져오기</button></div>}\n    {screen === 'home' && <Home");
s=s.replace('<section className="panel editor-panel"><div className="panel-heading"><span>현재 지원 규칙', '<SpriteLibrarySettings /><section className="panel editor-panel"><div className="panel-heading"><span>현재 지원 규칙');
const marker='function Settings(';const i=s.indexOf(marker);
s=s.slice(0,i)+`function SpriteLibrarySettings() {
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
      try { const count = await importSpriteFiles(files); setMessage(\`검증한 PNG \${count}개를 저장했습니다.\`); }
      catch (error) { setMessage(error instanceof Error ? error.message : '이미지를 가져오지 못했습니다.'); }
      finally { setLoading(false); }
    }} /></label>{message && <p role="status">{message}</p>}
  </section>;
}

`+s.slice(i);
fs.writeFileSync(p,s);
