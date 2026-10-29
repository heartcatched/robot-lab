import { clone, migrateProgram, validateProgram } from './model.js';
import { freshState, STORAGE_KEY, SANDBOX_KEY } from './storage.js';
import { exportProject, importProject } from './sandbox.js';

const MAX_BYTES=2*1024*1024;
export function normalizeProgress(saved,levels){
  if(!saved||![1,2].includes(saved.version)||!saved.levels||typeof saved.levels!=='object'||Array.isArray(saved.levels))throw Error('Неверный формат учебного прогресса.');
  const state=freshState(levels);
  if(!levels.some(l=>l.id===saved.current))throw Error('В сохранении указан неизвестный уровень.');
  state.current=saved.current;
  for(const [id,entry] of Object.entries(saved.levels)){
    const level=levels.find(l=>String(l.id)===id);if(!level)throw Error('В сохранении есть неизвестный уровень.');
    if(!entry||typeof entry!=='object')throw Error('Повреждены данные уровня '+id+'.');
    let program;try{program=migrateProgram(entry.program);}catch{throw Error('Повреждена программа уровня '+id+'.');}
    const valid=validateProgram(program,{draft:true,allowed:level.allowed});if(!valid.ok)throw Error(`Уровень ${id}: ${valid.message}`);
    const flags={};for(const key of ['completed','independent','hintUsed','solutionUsed']){
      if(entry[key]!==undefined&&typeof entry[key]!=='boolean')throw Error('Повреждён результат уровня '+id+'.');
      flags[key]=entry[key]===true;
    }
    const attempts=entry.attempts??0;if(!Number.isSafeInteger(attempts)||attempts<0)throw Error('Неверное число попыток.');
    state.levels[id]={program,attempts,...flags,independent:flags.completed&&flags.independent};
  }
  return state;
}
const cleanProject=project=>project===null?null:importProject(exportProject(project));
export function createBackup({progress,sandboxSaved=null,sandboxWorking=null},levels){
  return {format:'robokhod-backup',version:1,exportedAt:new Date().toISOString(),progress:normalizeProgress(progress,levels),sandboxSaved:cleanProject(sandboxSaved),sandboxWorking:cleanProject(sandboxWorking)};
}
export function parseBackup(text,levels){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Резервная копия должна быть не больше 2 МБ.');
  let data;try{data=JSON.parse(text);}catch{throw Error('Не удалось прочитать JSON резервной копии.');}
  if(data?.format!=='robokhod-backup'||data.version!==1)throw Error('Выбери файл всех сохранений Робохода, а не файл отдельного проекта.');
  if(!Object.hasOwn(data,'sandboxSaved')||!Object.hasOwn(data,'sandboxWorking'))throw Error('Резервная копия неполная.');
  return {...createBackup(data,levels),exportedAt:typeof data.exportedAt==='string'?data.exportedAt:''};
}
// Validate first, then write. A failed multi-key write restores previous values.
export function restoreBackup(storage,backup,levels){
  const data=parseBackup(JSON.stringify(backup),levels);
  const keys=[STORAGE_KEY,SANDBOX_KEY],old=keys.map(k=>storage.getItem(k));
  try{
    storage.setItem(STORAGE_KEY,JSON.stringify(data.progress));
    if(data.sandboxSaved)storage.setItem(SANDBOX_KEY,exportProject(data.sandboxSaved));else storage.removeItem(SANDBOX_KEY);
  }catch(error){
    for(let i=0;i<keys.length;i++)try{if(old[i]===null)storage.removeItem(keys[i]);else storage.setItem(keys[i],old[i]);}catch{/* Preserve the original failure; don't claim persistence. */}
    throw Error('Браузер не смог записать сохранения. Освободи место или разреши локальное хранение и попробуй снова.');
  }
  return clone(data);
}
