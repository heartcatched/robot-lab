import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../dist/levels.js';
import { simulate, expandProgram, validProgram, loadState, freshState, STORAGE_KEY } from '../dist/engine.js';

for (const level of LEVELS) {
  test(`Level ${level.id}: reference route reaches goal with all requirements`, () => {
    const result = simulate(level, level.solution);
    assert.equal(result.status, 'success');
    assert.deepEqual(result.position, level.goal);
    assert.equal(result.frames.length, expandProgram(level.solution).steps.length);
    assert.equal(new Set(level.walls.map(w => w.join(','))).size, level.walls.length);
    for (const wall of level.walls) {
      assert.notDeepEqual(wall, level.start);
      assert.notDeepEqual(wall, level.goal);
    }
  });
}
test('Initial debugging program fails at its fourth command; changing only that command solves it', () => {
  const level = LEVELS[3];
  const result = simulate(level, level.initial);
  assert.equal(result.status, 'wall');
  assert.equal(result.frames.at(-1).index, 3);
  const edited = [...level.initial]; edited[3] = 'up';
  assert.equal(simulate(level, edited).status, 'success');
});
test('Invalid moves do not enter blocked or out-of-bounds cells', () => {
  const wall = simulate(LEVELS[2], ['right', 'right']);
  assert.equal(wall.status, 'wall'); assert.deepEqual(wall.position, [4,1]);
  const boundary = simulate(LEVELS[0], ['left']);
  assert.equal(boundary.status, 'boundary'); assert.deepEqual(boundary.position, [4,0]);
});
test('Completion checks the final position, not just touching the goal', () => {
  assert.equal(simulate(LEVELS[0], ['right','right','right','right']).status, 'unfinished');
  assert.equal(simulate(LEVELS[0], []).status, 'empty');
});
test('Loop missions require a loop even when the destination is reached', () => {
  assert.equal(simulate(LEVELS[4], ['right','right','right','right']).status, 'needs-loop');
});
test('Loop trace preserves outer index, inner index and repetition for useful error messages', () => {
  const p = [{type:'repeat', count:3, body:['up','right']}, 'up'];
  const trace = expandProgram(p).steps;
  assert.equal(trace.length, 7);
  assert.deepEqual(trace[3], {direction:'right',index:0,inner:1,iteration:2});
  assert.deepEqual(trace[6], {direction:'up',index:1,inner:null,iteration:null});
});
test('Invalid and oversized programs are rejected without executing', () => {
  for (const program of [null, ['teleport'], ['toString'], [{type:'repeat',count:1,body:['up']}], [{type:'repeat',count:2,body:[]}], [{type:'repeat',count:2,body:[{type:'repeat',count:2,body:['up']}]}], Array(25).fill('up')]) {
    assert.equal(validProgram(program), false);
  }
  const long = Array(3).fill({type:'repeat', count:4, body:Array(8).fill('up')});
  assert.equal(expandProgram(long).error, 'limit');
  assert.equal(simulate(LEVELS[0], long).frames.length, 0);
});
test('Saved progress survives reload; malformed fields and unavailable storage are handled', () => {
  const original = freshState(LEVELS);
  original.current = 5; original.levels[1].completed = true; original.levels[1].independent = true;
  const restored = loadState({getItem: () => JSON.stringify(original)}, LEVELS);
  assert.deepEqual(restored.state, original);
  original.current = 900; original.levels[1].program = ['evil'];
  const invalid = loadState({getItem: () => JSON.stringify(original)}, LEVELS);
  assert.equal(invalid.state.current, 1);
  assert.deepEqual(invalid.state.levels[1].program, []);
  assert.equal(loadState({getItem: () => '{broken'}, LEVELS).storageOK, false);
  assert.equal(loadState({getItem: () => {throw new Error('blocked');}}, LEVELS).storageOK, false);
  assert.equal(loadState({getItem: () => null}, LEVELS).state.levels[4].program.length, 5);
});
