import type { BattleEvent } from '../engine/types';
import { readImportedSounds } from './sound-pack';

interface TypeSound {pitch:number;shape:OscillatorType;noise:number;filter:number}
export const typeSoundProfiles:Record<string,TypeSound>={
  normal:{pitch:280,shape:'triangle',noise:.12,filter:1200},fire:{pitch:135,shape:'sawtooth',noise:.38,filter:900},
  water:{pitch:420,shape:'sine',noise:.3,filter:1600},electric:{pitch:1150,shape:'square',noise:.24,filter:4200},
  grass:{pitch:690,shape:'triangle',noise:.2,filter:2200},ice:{pitch:1650,shape:'sine',noise:.14,filter:6200},
  fighting:{pitch:110,shape:'triangle',noise:.32,filter:600},poison:{pitch:230,shape:'sawtooth',noise:.2,filter:740},
  ground:{pitch:65,shape:'triangle',noise:.45,filter:220},flying:{pitch:540,shape:'sine',noise:.3,filter:3200},
  psychic:{pitch:930,shape:'sine',noise:.06,filter:4500},bug:{pitch:760,shape:'square',noise:.15,filter:1900},
  rock:{pitch:85,shape:'sawtooth',noise:.4,filter:470},ghost:{pitch:180,shape:'sine',noise:.18,filter:520},
  dragon:{pitch:125,shape:'sawtooth',noise:.32,filter:1800},dark:{pitch:155,shape:'square',noise:.21,filter:450},
  steel:{pitch:520,shape:'triangle',noise:.13,filter:4800},fairy:{pitch:1350,shape:'sine',noise:.04,filter:6600},
  stellar:{pitch:1500,shape:'triangle',noise:.1,filter:7000},
};
export function eventSoundKeys(event:BattleEvent,localSide='player'):string[] {
  if(event.kind==='move')return ['move-'+event.moveId,'type-'+(event.type??'normal')];
  if(event.kind==='damage')return [...(event.critical?['critical-hit']:[]),...(event.effectiveness!==undefined&&event.effectiveness>1?['super-effective']:event.effectiveness!==undefined&&event.effectiveness<1?['resisted-hit']:[]),'damage'];
  if(event.kind==='gimmick-transform')return ['gimmick-'+event.gimmick];
  if(event.kind==='status'&&event.status)return ['status-'+event.status];
  if(event.condition==='confusion')return ['status-confusion'];
  if(event.kind==='result')return [event.snapshot.winner===localSide?'victory':'defeat'];
  return [event.kind];
}

type Bus='effects'|'music';
class BattleAudio {
  private context:AudioContext|null=null;
  private effectsBus:GainNode|null=null;
  private musicBus:GainNode|null=null;
  private effectsEnabled=true;
  private effectsVolume=.65;
  private musicVolume=.3;
  private voices=new Map<AudioScheduledSourceNode,Bus>();
  private musicTimer:ReturnType<typeof setInterval>|undefined;
  private beat=0;
  private custom=new Map<string,AudioBuffer>();
  private loaded=false;
  private loadGeneration=0;
  get enabled(){return this.effectsEnabled;}
  set enabled(value:boolean){this.effectsEnabled=value;this.updateVolume();}
  setVolume(bus:Bus,value:number){if(bus==='effects')this.effectsVolume=Math.max(0,Math.min(1,value));else this.musicVolume=Math.max(0,Math.min(1,value));this.updateVolume();}
  private updateVolume(){if(this.effectsBus)this.effectsBus.gain.value=this.enabled?this.effectsVolume:0;if(this.musicBus)this.musicBus.gain.value=this.musicVolume;}
  unlock(){
    if(typeof window.AudioContext!=='function')return;
    if(!this.context){this.context=new AudioContext();this.effectsBus=this.context.createGain();this.musicBus=this.context.createGain();this.effectsBus.connect(this.context.destination);this.musicBus.connect(this.context.destination);this.updateVolume();}
    void this.context.resume().catch(()=>{});
    if(!this.loaded){this.loaded=true;void this.reloadCustomSounds().catch(()=>{});}
  }
  async reloadCustomSounds(){
    if(!this.context)return;
    const generation=++this.loadGeneration,sounds=await readImportedSounds(),decoded=new Map<string,AudioBuffer>();
    for(const sound of sounds)try{decoded.set(sound.key,await this.context.decodeAudioData(await sound.blob.arrayBuffer()));}catch{/* Invalid audio uses the synthesized cue. */}
    if(generation===this.loadGeneration)this.custom=decoded;
  }
  private track(source:AudioScheduledSourceNode,bus:Bus){this.voices.set(source,bus);source.onended=()=>{this.voices.delete(source);source.disconnect();};}
  stopEffects(){for(const [voice,bus] of this.voices)if(bus==='effects')try{voice.stop();}catch{/* Ended. */}}
  private sample(keys:string[]):boolean {
    const ctx=this.context,buffer=keys.map(key=>this.custom.get(key)).find(Boolean);
    if(!buffer||!ctx||ctx.state!=='running'||!this.enabled)return false;
    const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.effectsBus!);this.track(source,'effects');source.start();return true;
  }
  private tone(from:number,to:number,length:number,delay=0,shape:OscillatorType='sine',volume=.065,bus:Bus='effects'){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||bus==='effects'&&!this.enabled)return;
    const oscillator=ctx.createOscillator(),gain=ctx.createGain(),time=ctx.currentTime+delay;
    oscillator.type=shape;oscillator.frequency.setValueAtTime(from,time);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,to),time+length);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.015);gain.gain.exponentialRampToValueAtTime(.0001,time+length);
    oscillator.connect(gain);gain.connect(bus==='effects'?this.effectsBus!:this.musicBus!);this.track(oscillator,bus);oscillator.start(time);oscillator.stop(time+length+.03);
  }
  private noise(length:number,cutoff:number,volume:number,delay=0){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.enabled)return;
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*length),ctx.sampleRate),channel=buffer.getChannelData(0);
    for(let index=0;index<channel.length;index++)channel[index]=(Math.random()*2-1)*Math.pow(1-index/channel.length,1.4);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(this.effectsBus!);this.track(source,'effects');source.start(ctx.currentTime+delay);
  }
  confirm(){if(!this.sample(['confirm']))this.tone(660,950,.09,0,'square',.035);}
  cursor(){if(!this.sample(['cursor']))this.tone(740,820,.04,0,'square',.025);}
  cancel(){if(!this.sample(['cancel']))this.tone(540,340,.1,0,'triangle',.04);}
  preview(type='electric'){this.unlock();this.typeCue(type);}
  private typeCue(type:string,moveId?:string){
    if(this.sample(['move-'+moveId,'type-'+type]))return;
    const p=typeSoundProfiles[type]??typeSoundProfiles.normal;
    if(moveId==='earthquake'){for(let i=0;i<3;i++){this.noise(.35,220,.25,i*.22);this.tone(70,30,.3,i*.22,'triangle',.15);}return;}
    if(moveId==='steelbeam'){this.tone(110,1800,.48,0,'sawtooth',.07);this.noise(.65,6200,.1,.25);this.tone(1400,160,.7,.35,'triangle',.06);return;}
    if(moveId==='outrage'){[0,.18,.42].forEach(delay=>{this.tone(160,52,.4,delay,'sawtooth',.075);this.noise(.24,1700,.17,delay);});return;}
    this.tone(p.pitch*.5,p.pitch,.3,0,p.shape,.06);this.noise(.5,p.filter,p.noise*.35,.08);this.tone(p.pitch,p.pitch*.3,.45,.22,p.shape,.045);
    if(['fairy','ice','psychic','stellar'].includes(type))[1,1.5,2].forEach((ratio,i)=>this.tone(p.pitch*ratio,p.pitch*ratio,.2,i*.1,'sine',.022));
  }
  startMusic(){
    if(this.musicTimer)return;this.unlock();this.beat=0;
    const tick=()=>{const chords=[[146.83,220,293.66,349.23],[130.81,196,261.63,329.63],[174.61,261.63,349.23,440],[164.81,246.94,329.63,392]],chord=chords[Math.floor(this.beat/8)%chords.length],note=chord[this.beat%4];this.tone(note*2,note*2,.22,0,'triangle',.055,'music');if(this.beat%2===0)this.tone(chord[0]/2,chord[0]/2,.32,0,'sine',.07,'music');this.beat++;};
    tick();this.musicTimer=setInterval(tick,210);
  }
  stopMusic(){clearInterval(this.musicTimer);this.musicTimer=undefined;for(const [voice,bus] of this.voices)if(bus==='music')try{voice.stop();}catch{/* Ended. */}}
  play(event:BattleEvent,localSide='player'){
    const custom=this.sample(eventSoundKeys(event,localSide));
    if(!custom){
      if(event.kind==='move')this.typeCue(event.type??'normal',event.moveId);
      else if(event.kind==='damage'){
        const critical=event.critical===true,superHit=(event.effectiveness??1)>1,resisted=(event.effectiveness??1)<1;
        this.noise(critical?0.24:superHit?0.2:0.12,critical?2800:superHit?1700:resisted?480:950,critical?0.28:superHit?0.24:0.12);
        this.tone(critical?920:superHit?180:resisted?90:120,critical?210:superHit?38:45,critical?0.32:0.16,0,critical?'sawtooth':'triangle',critical?0.1:0.07);
        if(critical)this.tone(1450,620,.22,.065,'triangle',.07);
      }
      else if(event.kind==='switch-out')this.tone(1100,100,.4,0,'sine',.055);
      else if(event.kind==='switch-in'){this.noise(.14,4200,.1);[440,660,880].forEach((pitch,i)=>this.tone(pitch,pitch,.2,i*.09));}
      else if(event.kind==='heal')[660,880,1100].forEach((pitch,i)=>this.tone(pitch,pitch,.18,i*.1));
      else if(event.kind==='faint'){this.tone(260,45,.6,0,'triangle',.07);this.noise(.3,350,.08,.2);}
      else if(event.kind==='gimmick-start')this.tone(100,600,.5,0,'sine',.05);
      else if(event.kind==='gimmick-transform'){
        const pitches=event.gimmick==='mega'?[330,494,660,988]:event.gimmick==='tera'?[880,1320,1760,2200]:[110,165,220,330];
        pitches.forEach((pitch,i)=>this.tone(pitch,pitch*1.15,.35,i*.12,event.gimmick==='dynamax'?'sawtooth':'sine',.05));if(event.gimmick==='dynamax')this.noise(.8,420,.18);
      }else if(event.kind==='status'&&event.status)this.typeCue({burn:'fire',poison:'poison',paralysis:'electric',sleep:'psychic',freeze:'ice'}[event.status]);
      else if(event.kind==='result'){const notes=event.snapshot.winner===localSide?[330,440,660,880]:[440,392,330,220];notes.forEach((pitch,i)=>this.tone(pitch,pitch,.35,i*.13,'triangle',.06));}
    }
    if(event.kind==='result')this.stopMusic();
    const own=event.snapshot.sides[localSide as 'player'|'cpu'];
    const low=own?.active.map(index=>own.team[index]).some(mon=>!mon.fainted&&mon.hp/mon.maxHp<=.2);
    if(low&&(event.kind==='turn-end'||event.kind==='damage'&&own.team.some(mon=>mon.uid===event.targetUid)&&(event.beforeHp??0)/(own.team.find(mon=>mon.uid===event.targetUid)?.maxHp??1)>.2)){
      if(!this.sample(['low-hp']))[0,.22].forEach(delay=>this.tone(920,920,.12,delay,'square',.038));
    }
  }
}
export const battleAudio=new BattleAudio();
