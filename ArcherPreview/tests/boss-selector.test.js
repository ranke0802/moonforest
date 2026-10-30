import test from 'node:test';
import assert from 'node:assert/strict';
import { BossSelection, bossSelectionHelp, summonSelectedBoss } from '../src/boss-selection.js';

test('bear quantities survive selecting either single resident phase', () => {
  const selection=new BossSelection();
  selection.setCount(5);
  assert.deepEqual(selection.choose('elena',true),{kind:'elena',count:1,phase:1});
  selection.setCount(4);
  assert.deepEqual(selection.choose('mourning-elena',true),{kind:'mourning-elena',count:1,phase:2});
  assert.deepEqual(selection.choose('bear',true),{kind:'bear',count:5,phase:null});
});

test('leaving the cave falls back to bears and never silently reselects Elena', () => {
  const selection=new BossSelection();
  selection.setCount(3);
  selection.choose('mourning-elena',true);
  assert.deepEqual(selection.current(false),{kind:'bear',count:3,phase:null});
  assert.equal(selection.current(true).kind,'bear');
  assert.equal(selection.choose('elena',false).kind,'bear');
  assert.equal(selection.choose('unknown',true).kind,'bear');
});

test('bear quantities stay within the existing one to five range', () => {
  const selection=new BossSelection();
  for(const [input,expected] of [[0,1],[8,5],['4',4],[2.9,2],[NaN,1]]){
    selection.setCount(input);
    assert.equal(selection.current(true).count,expected);
  }
});

test('selection dispatches each Elena phase to the resident API and bears to counted summon', async () => {
  const calls=[],player={id:'player'};
  const battle={
    summon:async(...args)=>{calls.push(['bear',...args]);return true;},
    summonResident:async(...args)=>{calls.push(['resident',...args]);return true;},
  };
  const selection=new BossSelection();selection.setCount(4);
  for(const kind of ['bear','elena','mourning-elena'])assert.equal(await summonSelectedBoss(battle,player,selection.choose(kind,true)),true);
  assert.deepEqual(calls,[['bear',player,4,'bear'],['resident',player,1],['resident',player,2]]);
});

test('accessible help explains the cave restriction and fixed resident count', () => {
  const selection=new BossSelection();
  assert.match(bossSelectionHelp(selection.current(false),false),/마녀의 동굴/);
  assert.match(bossSelectionHelp(selection.choose('elena',true),true),/한 마리/);
  assert.match(bossSelectionHelp(selection.choose('mourning-elena',true),true),/한 마리/);
});
