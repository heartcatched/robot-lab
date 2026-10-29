import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from '../dist/levels.js';
import {freshState,STORAGE_KEY,SANDBOX_KEY} from '../dist/storage.js';
import {blankProject} from '../dist/sandbox.js';
import {createBackup,parseBackup,restoreBackup} from '../dist/backup.js';
import {EditHistory} from '../dist/history.js';
import {clone} from '../dist/model.js';
const memory=()=>{const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('Backup preserves results, assistance, attempts and two different sandbox states',()=>{
  const progress=freshState(LEVELS);Object.assign(progress.levels[3],{completed:true,independent:false,hintUsed:true,attempts:4});progress.current=3;
  const sandboxSaved=blankProject(),sandboxWorking=blankProject();sandboxWorking.title='Ещё не сохранено';
  const backup=createBackup({progress,sandboxSaved,sandboxWorking},LEVELS),parsed=parseBackup(JSON.stringify(backup),LEVELS);
  assert.deepEqual(parsed.progress,progress);assert.deepEqual(parsed.sandboxWorking,sandboxWorking);
  const store=memory();restoreBackup(store,parsed,LEVELS);assert.deepEqual(JSON.parse(store.getItem(STORAGE_KEY)),progress);assert.equal(JSON.parse(store.getItem(SANDBOX_KEY)).title,sandboxSaved.title);
});
test('Legacy progress remains importable; original storage key is untouched',()=>{
  const store=memory();store.setItem('robokhod-progress-v1','backup');
  const backup=createBackup({progress:{version:1,current:1,levels:{1:{program:['right'],attempts:2}}}},LEVELS);
  const restored=restoreBackup(store,backup,LEVELS);assert.equal(restored.progress.levels[1].program.main[0].direction,'right');assert.equal(store.getItem('robokhod-progress-v1'),'backup');
});
test('Invalid backup is rejected before touching existing values',()=>{
  const store=memory();store.setItem(STORAGE_KEY,'old');const b=createBackup({progress:freshState(LEVELS)},LEVELS);
  b.progress.levels[1].attempts=-1;assert.throws(()=>restoreBackup(store,b,LEVELS));assert.equal(store.getItem(STORAGE_KEY),'old');
  for(const s of ['bad','{}',JSON.stringify(blankProject()),' '.repeat(2097153)])assert.throws(()=>parseBackup(s,LEVELS));
});
test('A write failure rolls progress back and never reports success',()=>{
  const store=memory();store.setItem(STORAGE_KEY,'old progress');store.setItem(SANDBOX_KEY,'old project');const set=store.setItem;
  let fail=true;store.setItem=(key,value)=>{if(key===SANDBOX_KEY&&fail){fail=false;throw Error('quota');}set(key,value);};
  const b=createBackup({progress:freshState(LEVELS),sandboxSaved:blankProject()},LEVELS);
  assert.throws(()=>restoreBackup(store,b,LEVELS),/не смог/);assert.equal(store.getItem(STORAGE_KEY),'old progress');assert.equal(store.getItem(SANDBOX_KEY),'old project');
});
test('History is independent, bounded, cloned and ignores no-op edits',()=>{
  const history=new EditHistory(50),before={main:[1]};history.record('level-1',before,{main:[2]});before.main.push(3);
  assert.deepEqual(history.undo('level-1'),{main:[1]});assert.equal(history.canUndo('level-2'),false);
  history.record('sandbox',{x:1},{x:1});assert.equal(history.canUndo('sandbox'),false);
  for(let i=0;i<60;i++)history.record('sandbox',{x:i},{x:i+1});
  for(let i=59;i>=10;i--)assert.deepEqual(history.undo('sandbox'),{x:i});assert.equal(history.undo('sandbox'),null);
  history.record('a',{x:1},{x:2});history.clear();assert.equal(history.canUndo('a'),false);
});
