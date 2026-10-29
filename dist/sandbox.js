import { LIMITS, PROCEDURES, clone, emptyProgram, makeScene, validateScene, validateProgram } from './model.js';

export const blankProject = () => ({format:'robokhod-project',version:1,title:'Моя задача',scene:makeScene({goal:[4,4]}),program:emptyProgram()});
function cleanScene(scene) {
  const valid=validateScene(scene); if(!valid.ok) throw Error(valid.message);
  return makeScene(scene);
}
function cleanProgram(program) {
  const valid=validateProgram(program,{draft:true}); if(!valid.ok) throw Error(valid.message);
  const list=items=>items.map(n=>{
    const item={id:n.id,type:n.type};
    if(n.type==='move') item.direction=n.direction;
    if(n.type==='call') item.name=n.name;
    if(n.type==='repeat') {item.count=n.count;item.body=list(n.body);}
    if(n.type==='while') {item.condition=n.condition;item.body=list(n.body);}
    if(n.type==='if') {item.condition=n.condition;item.then=list(n.then);item.else=list(n.else);}
    return item;
  });
  return {main:list(program.main),procedures:Object.fromEntries(PROCEDURES.map(name=>[name,list(program.procedures[name])]))};
}
function titleOf(value) {
  if(typeof value!=='string'||value.trim().length<1||value.length>80) throw Error('Название должно содержать от 1 до 80 символов.');
  return value.trim();
}
function parse(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.bytes) throw Error('Файл слишком большой. Максимум — 128 КБ.');
  try {return JSON.parse(text);} catch {throw Error('Не удалось прочитать JSON. Выбери файл проекта Робохода.');}
}
export function exportProject(project) {
  return JSON.stringify({format:'robokhod-project',version:1,title:titleOf(project.title),scene:cleanScene(project.scene),program:cleanProgram(project.program)},null,2);
}
export function importProject(text) {
  const data=parse(text);
  if(data?.format!=='robokhod-project'||data.version!==1) throw Error('Это не файл проекта Робохода версии 1.');
  return JSON.parse(exportProject(data));
}
export function taskPayload(project) {
  const scene=cleanScene(project.scene);
  if(!scene.goal&&!(scene.targets?.length)) throw Error('Добавь станцию или клетки для закрашивания — так у задачи появится цель.');
  // Deliberately build an allowlist. Neither programs nor results travel in links.
  return {format:'robokhod-task',version:1,title:titleOf(project.title),scene};
}
export function encodeTask(project) {
  const bytes=new TextEncoder().encode(JSON.stringify(taskPayload(project)));
  return '#task='+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeTask(hash) {
  if(!hash.startsWith('#task=')||hash.length>16384||!/^#task=[a-zA-Z0-9_-]+$/.test(hash)) throw Error('Ссылка на задачу повреждена или слишком длинная.');
  let data;
  try {
    const raw=atob(hash.slice(6).replaceAll('-','+').replaceAll('_','/'));
    data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
  } catch {throw Error('Не удалось прочитать задачу из ссылки.');}
  if(data?.format!=='robokhod-task'||data.version!==1) throw Error('Неизвестный формат ссылки на задачу.');
  const task=taskPayload(data);
  return {...task,format:'robokhod-project',program:emptyProgram()};
}
export function copyProject(project) {return clone(project);}
