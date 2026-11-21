import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deck, makeGame, makePlayer, startRound, chooseTrump, bid, play, finishTrick,
  legalCard, requiredSuit, trickWinner, view, rematch
} from '../engine.js';
const c=(s,v=1)=>({id:`${s}-${v}`,s,v});
test('special cards from supplied rulebook: all jesters, wizard after number, jester then wizard',()=>{
 assert.equal(trickWinner([{index:1,card:c('jester')},{index:2,card:c('jester')}],'red'),1);
 assert.equal(trickWinner([{index:1,card:c('red',13)},{index:2,card:c('wizard')},{index:0,card:c('blue',13)}],'red'),2);
 assert.equal(requiredSuit([{card:c('jester')},{card:c('jester')},{card:c('blue',3)}]),'blue');
 assert.equal(requiredSuit([{card:c('jester')},{card:c('wizard')},{card:c('blue',3)}]),null);
 assert.equal(requiredSuit([{card:c('blue',3)},{card:c('wizard')},{card:c('red',3)}]),'blue');
});
test('each of the four card suits contains 1–13; plus four Wizards and four Jesters',()=>{
 const d=deck();
 for(const suit of ['red','blue','green','yellow']) assert.deepEqual(d.filter(x=>x.s===suit).map(x=>x.v),Array.from({length:13},(_,i)=>i+1));
 assert.equal(d.filter(x=>x.s==='wizard').length,4);
 assert.equal(d.filter(x=>x.s==='jester').length,4);
});
test('only own hand is sent to a player, never others',()=>{
 const g=makeGame('TEST99','A','t0');g.players.push(makePlayer('B','t1'),makePlayer('C','t2'));
 startRound(g);
 assert.equal(view(g,0).hand.length,1);
 assert.equal(view(g,1).hand.length,1);
 assert.notDeepEqual(view(g,0).hand,view(g,1).hand);
 assert.equal('token' in view(g,0).players[0],false);
 assert.equal('hand' in view(g,0).players[1],false);
});
test('full game simulation completes for 3–6 players, scoring each round and 60 cards in final round',()=>{
 for (const players of [3,4,5,6]) {
  const g=makeGame('SIM123','P0','t0');
  for(let p=1;p<players;p++)g.players.push(makePlayer(`P${p}`,`t${p}`));
  let actions=0;
  while(g.phase!=='finished') {
   if(g.phase==='lobby'||g.phase==='roundEnd')startRound(g);
   if(g.phase==='chooseTrump')chooseTrump(g,g.dealer,'blue');
   while(g.phase==='bid')bid(g,g.turn,0);
   while(g.phase==='play'||g.phase==='trickEnd'){
    if(g.phase==='trickEnd'){finishTrick(g);continue;}
    const index=g.turn;
    const card=g.players[index].hand.find(card=>legalCard(g.players[index].hand,g.table,card));
    assert.ok(card,'Must always have a legal card');
    play(g,index,card.id);
    actions++;
   }
  }
  assert.equal(g.round,60/players);
  assert.equal(g.history.length,60/players);
  assert.equal(actions,players*(60/players)*(60/players+1)/2);
  assert.ok(g.players.every(p=>p.hand.length===0));
  assert.equal(g.trump,null);
  assert.equal(g.reveal,null);
  rematch(g);
  assert.equal(g.phase,'lobby');
  assert.equal(g.history.length,0);
  assert.ok(g.players.every(p=>p.score===0));
 }
});
