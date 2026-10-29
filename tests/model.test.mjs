import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../dist/levels.js';
import { move, paint, repeat, when, call, programOf, makeScene, validateScene, validateProgram, canMove } from '../dist/model.js';
import { loadState, STORAGE_KEY, LEGACY_KEY } from '../dist/storage.js';

test('Legacy progress migrates once, preserving all completed results and the original backup', () => {
  const old = { version: 1, current: 5, levels: {
    1: {program:['right','right','right'],completed:true,independent:true,attempts:3},
    5: {program:[{type:'repeat', count:4, body:['right']}],completed:true,hintUsed:true,solutionUsed:true,attempts:2},
  }};
  const data = new Map([[LEGACY_KEY, JSON.stringify(old)]]);
  const storage = {getItem:k => data.get(k),setItem:(k,v) => data.set(k,v)};
  const first = loadState(storage, LEVELS);
  assert.equal(first.migrated, true);
  assert.equal(first.state.current, 5);
  assert.equal(first.state.levels[1].independent, true);
  assert.equal(first.state.levels[1].attempts, 3);
  assert.equal(first.state.levels[5].program.main[0].type, 'repeat');
  assert.equal(first.state.levels[5].solutionUsed, true);
  assert.equal(data.get(LEGACY_KEY), JSON.stringify(old));
  assert.ok(data.has(STORAGE_KEY));
  const second = loadState(storage, LEVELS);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.state, first.state);
});
test('Unavailable storage still allows a fresh playable state', () => {
  const {state,storageOK} = loadState({getItem(){throw Error('blocked');}}, LEVELS);
  assert.equal(storageOK,false); assert.equal(state.levels[4].program.main.length,5);
});
test('Walls block both sides and do not consume a cell', () => {
  const scene = makeScene({edges:[[2,2,'right']]});
  assert.equal(canMove(scene,[2,2],'right'),false);
  assert.equal(canMove(scene,[2,3],'left'),false);
  assert.equal(canMove(scene,[1,3],'down'),true);
  assert.equal(validateScene(scene).ok,true);
});
test('Draft bodies persist but execution validation explains missing commands', () => {
  const p=programOf([when('free:right',[])]);
  assert.equal(validateProgram(p,{draft:true}).ok,true);
  assert.equal(validateProgram(p).ok,false);
});
test('Program validation rejects cycles, too much nesting and unrecognized commands', () => {
  assert.equal(validateProgram(programOf([call('А')],{А:[call('Б')],Б:[call('А')]}),{draft:true}).ok,false);
  const nested = programOf([repeat(2,[repeat(2,[repeat(2,[repeat(2,[paint()])])])])]);
  assert.equal(validateProgram(nested).ok,false);
  assert.equal(validateProgram(programOf(Array.from({length:81},()=>move('right')))).ok,false);
  assert.equal(validateProgram(programOf([move('constructor')])).ok,false);
});
test('Scene validation rejects blocked objectives and invalid coordinates', () => {
  assert.equal(validateScene(makeScene({blocks:[[4,0]]})).ok,false);
  assert.equal(validateScene(makeScene({goal:[99,0]})).ok,false);
  assert.equal(validateScene(makeScene({edges:[[0,0,'up']]})).ok,false);
});
