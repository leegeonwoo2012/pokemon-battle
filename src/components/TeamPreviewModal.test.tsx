// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {TeamPreviewModal} from './TeamPreviewModal';
import type {TeamPreviewEntry} from '../network/friendBattle';

const names=['라이츄','리자몽','갸라도스','거북왕','이상해꽃','윈디'];
const own:TeamPreviewEntry[]=names.map((speciesName,index)=>({speciesId:['raichu','charizard','gyarados','blastoise','venusaur','arcanine'][index],speciesName,level:50,gender:null,form:'base',itemRevealed:false,abilityRevealed:false}));
afterEach(cleanup);

it('submits the clicked single roster in the visible lead and reserve order',()=>{
  const onSubmit=vi.fn();
  render(<TeamPreviewModal format="singles" own={own} opponent={own} endsAt={Date.now()+90_000} submitted={false} opponentSubmitted={false} opponentName="상대" onSubmit={onSubmit} onExit={vi.fn()}/>);
  const roster=within(screen.getByRole('region',{name:'내 파티'}));
  for(const index of [4,1,5])fireEvent.click(roster.getAllByRole('button')[index]);
  fireEvent.click(screen.getByRole('button',{name:'3마리 선출 완료'}));
  expect(onSubmit).toHaveBeenCalledWith({indices:[4,1,5]});
});

it('reorders a double selection by dropping a Pokémon into an earlier slot',()=>{
  const onSubmit=vi.fn();
  render(<TeamPreviewModal format="doubles" own={own} opponent={own} endsAt={Date.now()+90_000} submitted={false} opponentSubmitted={false} opponentName="상대" onSubmit={onSubmit} onExit={vi.fn()}/>);
  const roster=within(screen.getByRole('region',{name:'내 파티'}));
  for(const index of [0,1,2,3])fireEvent.click(roster.getAllByRole('button')[index]);
  const slots=document.querySelectorAll('.team-preview-slot');
  fireEvent.drop(slots[0],{dataTransfer:{getData:()=> '3'}});
  fireEvent.click(screen.getByRole('button',{name:'4마리 선출 완료'}));
  expect(onSubmit).toHaveBeenCalledWith({indices:[3,0,1,2]});
});
