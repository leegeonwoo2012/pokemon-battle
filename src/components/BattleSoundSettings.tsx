import { useEffect, useState } from 'react';
import { Music2, Volume2 } from 'lucide-react';
import { battleAudio } from '../presentation/audio';
import { clearImportedSounds, importBattleSounds, readImportedSounds } from '../presentation/sound-pack';

export function BattleSoundSettings(){
  const [count,setCount]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [effects,setEffects]=useState(()=>Number(localStorage.getItem('arena-effects-volume')??.65));
  const [music,setMusic]=useState(()=>Number(localStorage.getItem('arena-music-volume')??.3));
  useEffect(()=>{void readImportedSounds().then(sounds=>setCount(sounds.length)).catch(()=>{});},[]);
  function volume(bus:'effects'|'music',value:number){if(bus==='effects')setEffects(value);else setMusic(value);localStorage.setItem(`arena-${bus}-volume`,String(value));battleAudio.setVolume(bus,value);}
  return <section className="panel editor-panel sound-settings"><div className="panel-heading"><span>배틀 사운드</span><Volume2 size={18}/></div>
    <label className="sound-volume"><span><Volume2 size={15}/>효과음</span><input aria-label="효과음 음량" type="range" min="0" max="1" step=".05" value={effects} onChange={event=>volume('effects',Number(event.target.value))}/><b>{Math.round(effects*100)}%</b></label>
    <label className="sound-volume"><span><Music2 size={15}/>배경음악</span><input aria-label="배경음악 음량" type="range" min="0" max="1" step=".05" value={music} onChange={event=>volume('music',Number(event.target.value))}/><b>{Math.round(music*100)}%</b></label>
    <p>타입별 공격·교체·기절·기믹·HP 경고음을 재생합니다. 기본 효과음은 직접 제작한 합성음입니다.</p>
    <button className="secondary-button compact sound-preview" onClick={()=>battleAudio.preview('electric')}>전기 효과음 듣기</button>
    <p>공식 게임 효과음은 포함되어 있지 않습니다. 사용할 수 있는 WAV·OGG·MP3 파일을 가져오면 해당 효과음에 연결됩니다. 이 브라우저에 {count}개 저장됨.</p>
    <details><summary>파일 이름과 연결 방법</summary><p><code>move-surf.wav</code>: 파도타기 · <code>move-steelbeam.wav</code>: 철제광선<br/><code>type-water.wav</code>: 물 타입 공통 · <code>gimmick-mega.wav</code>: 메가진화<br/><code>switch-in.wav</code>, <code>switch-out.wav</code>, <code>faint.wav</code>, <code>low-hp.wav</code><br/>전용 기술 파일 → 타입 공통 파일 → 기본 합성음 순으로 재생합니다.</p></details>
    <label className="sprite-import">{busy?'음원 확인 중…':'효과음 파일 가져오기'}<input aria-label="효과음 파일 가져오기" type="file" accept=".wav,.ogg,.mp3,.m4a" multiple disabled={busy} onChange={async event=>{const files=event.target.files;if(!files)return;setBusy(true);battleAudio.unlock();try{const imported=await importBattleSounds(files);await battleAudio.reloadCustomSounds();setCount((await readImportedSounds()).length);setMessage(`${imported}개 음원을 실제 디코딩해 연결했습니다.`);}catch(error){setMessage(error instanceof Error?error.message:'음원 가져오기에 실패했습니다.');}finally{setBusy(false);}}}/></label>
    <button className="text-button" disabled={busy||count===0} onClick={async()=>{setBusy(true);try{await clearImportedSounds();await battleAudio.reloadCustomSounds();setCount(0);setMessage('가져온 효과음을 지웠습니다. 기본 합성음을 사용합니다.');}catch(error){setMessage(error instanceof Error?error.message:'음원 삭제에 실패했습니다.');}finally{setBusy(false);}}}>가져온 효과음 지우기</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
