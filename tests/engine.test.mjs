import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../dist/levels.js';
import { makeScene, move, paint, repeat, when, until, call, programOf } from '../dist/model.js';
import { simulate, verifyLevel } from '../dist/engine.js';
import { generateCode } from '../dist/code.js';
for (const level of LEVELS) test(`Level ${level.id}: reference program solves every scene`, () => {
  const checked = verifyLevel(level,level.solution);
  assert.equal(checked.success,true,JSON.stringify(checked.results.map(r=>({status:r.status,message:r.message}))));
});
test('Wall, boundary and final-position failures are distinct',()=>{
  assert.equal(simulate(LEVELS[3].scenes[0],LEVELS[3].initial).status,'wall');
  assert.equal(simulate(LEVELS[0].scenes[0],programOf([move('left')])).status,'boundary');
  assert.equal(simulate(LEVELS[0].scenes[0],programOf([repeat(4,[move('right')])])).status,'unfinished');
});
test('Both branches, zero-iteration while and painted/clear predicates use current state',()=>{
  const scene=makeScene({start:[4,0],goal:[4,1],targets:[[4,0]]});
  const p=programOf([until('free:left',[move('left')]),when('clear',[paint()]),when('painted',[move('right')],[move('up')])]);
  const r=simulate(scene,p);assert.equal(r.status,'success');
  assert.deepEqual(r.frames.filter(f=>f.kind==='condition').map(f=>f.truth),[false,true,true]);
  assert.equal(simulate(makeScene({start:[4,0],goal:[4,1]}),programOf([when('free:left',[move('left')],[move('right')])])).status,'success');
});
test('Painting is idempotent and exact targets identify missing and extra cells',()=>{
  const scene=makeScene({targets:[[4,0]]});
  assert.equal(simulate(scene,programOf([paint(),paint()])).status,'success');
  const wrong=simulate(scene,programOf([move('right'),paint()]));
  assert.equal(wrong.status,'paint');assert.deepEqual(wrong.missing,['4,0']);assert.deepEqual(wrong.extra,['4,1']);
});
test('Repetition is bounded, including when no move happens',()=>{
  const r=simulate(makeScene(),programOf([until('free:right',[paint()])]));
  assert.equal(r.status,'limit');assert.ok(r.frames.length<=1000);
});
test('Procedures return to caller and code uses matching Kumir constructs',()=>{
  const p=programOf([repeat(2,[call('А')]),move('right')],{А:[move('right')]});
  const r=simulate(LEVELS[0].scenes[0],p);
  assert.equal(r.status,'success');assert.equal(r.calls.А,2);
  const code=generateCode(p);assert.match(code.text,/нц 2 раз/);assert.match(code.text,/алг А\nнач\n  вправо\nкон/);
  assert.equal(code.lines[code.mapping[p.main[0].id]].id,p.main[0].id);
});
test('Unreachable constructs do not satisfy a lesson objective',()=>{
  const scene=makeScene({goal:[4,1]});
  const p=programOf([when('free:left',[repeat(2,[paint()])]),move('right')]);
  assert.equal(simulate(scene,p,{required:['repeat']}).status,'needs-construct');
});
