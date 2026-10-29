import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,exportProject,importProject,encodeTask,decodeTask} from '../dist/sandbox.js';
import {move,when,call,programOf} from '../dist/model.js';

test('Project files preserve the editable scene and nested program',()=>{
  const p=blankProject();p.title='Моя лаборатория 🧩';p.scene.edges=[[3,1,'up']];p.scene.targets=[[4,2]];
  p.program=programOf([when('free:right',[call('А')])],{А:[move('right')]});
  assert.deepEqual(importProject(exportProject(p)),p);
});
test('Task links contain no program, procedures, results or unknown solution fields',()=>{
  const p=blankProject();p.title='Задача с условием';p.program=programOf([move('right')]);p.solution='SECRET';p.scene.solution='SECRET';
  const hash=encodeTask(p),json=Buffer.from(hash.slice(6),'base64url').toString();
  for(const s of ['program','procedures','SECRET','solution']) assert.ok(!json.includes(s));
  const task=decodeTask(hash);assert.equal(task.title,p.title);assert.equal(task.program.main.length,0);assert.equal(task.scene.goal[1],4);
});
test('Broken and foreign links are rejected',()=>{
  for(const s of ['#task=!','#task=abc','#workspace','#task='+'a'.repeat(16400)]) assert.throws(()=>decodeTask(s));
});
test('Malformed files, huge files and invalid fields are rejected without mutating the draft',()=>{
  const p=blankProject(),before=exportProject(p);
  for(const s of ['not json','[]','{}',' '.repeat(131073)]) assert.throws(()=>importProject(s));
  const bad=JSON.parse(before);bad.scene.rows=100;assert.throws(()=>importProject(JSON.stringify(bad)));
  bad.scene.rows=5;bad.program.main=[{id:'n',type:'javascript',code:'alert(1)'}];assert.throws(()=>importProject(JSON.stringify(bad)));
  assert.equal(exportProject(p),before);
});
test('Recursive imported programs fail before opening',()=>{
  const p=blankProject();p.program=programOf([call('А')],{А:[call('А')]});
  assert.throws(()=>importProject(JSON.stringify(p)),/сам себя/);
});
test('A shared task needs a goal; free experiments can still be saved to file',()=>{
  const p=blankProject();p.scene.goal=null;
  assert.throws(()=>encodeTask(p),/цель/);assert.ok(importProject(exportProject(p)));
  p.scene.targets=[[4,3]];assert.ok(decodeTask(encodeTask(p)));
});
