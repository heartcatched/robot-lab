import { LEVELS, CHAPTERS } from './levels.js';
import { DIRECTIONS, CONDITIONS, PROCEDURES, clone, emptyProgram, move, paint, repeat, when, until, call, walkProgram, validateProgram, validateScene, makeScene, sameCell, cellKey, edgeCells, edgeKey, inBounds } from './model.js';
import { execute, verifyLevel } from './engine.js';
import { generateCode } from './code.js';
import { loadState, freshState, STORAGE_KEY, SANDBOX_KEY } from './storage.js';
import { blankProject, exportProject, importProject, encodeTask, decodeTask } from './sandbox.js';
import { createBackup, parseBackup, restoreBackup } from './backup.js';
import { EditHistory } from './history.js';

const $=id=>document.getElementById(id);
const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error('Storage unavailable');},setItem(){throw Error('Storage unavailable');}};}
const loaded=loadState(storage,LEVELS);
let state=loaded.state, mode='course', variant=0, scope='main', view='blocks', selected=null, insertion={id:null,branch:null};
let sandbox=blankProject(), sandboxDirty=false, sandboxSource='draft', edgeCell=null;
let run=null, activeId=null, failedId=null, world=null, variantResults=null, confirmation=null;
const history=new EditHistory(),UI_KEY='robokhod-ui-v1';
let training=false,pendingBackup=null,titleBefore=null,settingsOpened=false;
const phone=matchMedia('(max-width: 639px)'),compactNav=matchMedia('(max-width: 1023px)');
try{training=JSON.parse(storage.getItem(UI_KEY)||'{}').started===true||!!storage.getItem(STORAGE_KEY)||!!storage.getItem('robokhod-progress-v1');}catch{}
let hasStarted=training;
try{const raw=storage.getItem(SANDBOX_KEY);if(raw)sandbox=importProject(raw);}catch{/* A damaged draft does not prevent training. */}
const level=()=>LEVELS.find(l=>l.id===state.current);
const entry=()=>state.levels[state.current];
const program=()=>mode==='course'?entry().program:sandbox.program;
const scene=()=>mode==='course'?level().scenes[variant]:sandbox.scene;
const allowed=()=>mode==='course'?level().allowed:['move','paint','repeat','if','while','call'];
const busy=()=>run!==null;
const historyKey=()=>mode==='course'?`level-${state.current}`:'sandbox';
const editSnapshot=()=>clone(mode==='course'?program():sandbox);
function notice(){ $('storage-notice').hidden=false; }
if(!loaded.storageOK)notice();
function persist(){try{storage.setItem(STORAGE_KEY,JSON.stringify(state));$('course-save-status').textContent='Сохранено в браузере';}catch{notice();$('course-save-status').textContent='Хранится до закрытия';}}
function markDirty(){sandboxDirty=true;$('sandbox-save-status').textContent='Есть изменения. Нажми «Сохранить» или скачай файл проекта.';}
function saveProgram(){if(mode==='course')persist();else markDirty();}
function resetWorld(){world={position:[...scene().start],painted:scene().initialPaint.map(cellKey),operations:0};activeId=null;failedId=null;}
function feedback(type,title,message,action){
  const box=$('feedback');box.className='feedback '+type;box.replaceChildren();
  const details=document.createElement('details'),summary=document.createElement('summary');
  const strong=document.createElement('b');strong.textContent=title;summary.append(strong);details.append(summary);
  const p=document.createElement('p');p.textContent=message;details.append(p);box.append(details);
  if(action){const b=document.createElement('button');b.className='feedback-action';b.textContent=action.label;b.addEventListener('click',action.fn);box.append(b);}
}
function syncShell(){
  document.body.classList.toggle('training',training);$('home-button').hidden=!training;
  $('start-label').textContent=hasStarted?'Продолжить тренировку':'Начать тренировку';
  $('start-note').textContent=hasStarted?(mode==='sandbox'?'Вернёшься к своему полю и программе в песочнице.':`Вернёшься к уровню ${state.current}: «${level().title}».`):'Нажми, чтобы открыть первый уровень и провести Роби до станции.';
  if(compactNav.matches){$('journey-slot').append($('journey'));}else{$('journey-dialog').close();$('workspace').prepend($('journey'));}
  if(phone.matches){$('palette-dialog').append($('command-drawer'));}else{$('palette-dialog').close();$('palette-slot').append($('command-drawer'));}
}
function enterTraining(){training=true;hasStarted=true;try{storage.setItem(UI_KEY,JSON.stringify({started:true}));}catch{notice();}syncShell();}
function home(){if(busy())stopExecution();training=false;syncShell();window.scrollTo(0,0);$('start-button').focus();}
function openPalette(){if(busy())return;view='blocks';renderEditor();if(phone.matches)$('palette-dialog').showModal();else $('direction-palette').querySelector('button')?.focus();}
phone.addEventListener('change',syncShell);compactNav.addEventListener('change',syncShell);
function undoEdit(){
  if(busy())return;const previous=history.undo(historyKey());if(!previous)return;
  if(mode==='course')entry().program=previous;else sandbox=previous;
  selected=null;scope='main';insertion={id:null,branch:null};edgeCell=null;edited();renderHeader();feedback('','Изменение отменено','Результаты прохождения и использованная помощь сохранены.');
}
function ready(){feedback('','Сначала план, потом запуск',mode==='course'?'Добавь команды и проверь маршрут. «Шаг» поможет увидеть каждое действие.':'Выбери инструмент и измени поле. Затем составь программу и проверь свою задачу.');}
function confirmAction(title,message,fn){confirmation=fn;$('confirm-title').textContent=title;$('confirm-copy').textContent=message;$('confirm-dialog').showModal();}
$('confirm-cancel').onclick=()=>{$('confirm-dialog').close();confirmation=null;};
$('confirm-ok').onclick=()=>{const fn=confirmation;confirmation=null;$('confirm-dialog').close();fn?.();};
$('confirm-dialog').addEventListener('cancel',()=>{confirmation=null;});

function renderNavigation(){
  const completed=LEVELS.filter(l=>state.levels[l.id].completed).length;
  $('journey-count').textContent=`${completed} / ${LEVELS.length}`;
  $('quick-results').textContent=`${completed} / ${LEVELS.length}`;
  $('progress-percent').textContent=Math.round(completed/LEVELS.length*100)+'%';
  $('progress-fill').style.width=completed/LEVELS.length*100+'%';
  $('progress-track').setAttribute('aria-valuenow',completed);
  $('chapter-select').innerHTML=CHAPTERS.map((ch,i)=>`<option value="${h(ch)}">${i+1}. ${h(ch)}</option>`).join('');
  $('chapter-select').value=level().chapter;
  $('level-list').innerHTML=LEVELS.filter(l=>l.chapter===level().chapter).map(l=>`<button class="level-button ${l.id===state.current?'active':''}" data-level="${l.id}" ${l.id===state.current?'aria-current="step"':''} aria-label="Уровень ${l.id}: ${h(l.title)}${state.levels[l.id].completed?', пройден':''}"><span class="level-num">${l.id}</span><span class="level-name">${h(l.title)}</span>${state.levels[l.id].completed?'<span aria-hidden="true">✓</span>':''}</button>`).join('');
  $('course-navigation').hidden=mode!=='course';$('sandbox-intro').hidden=mode!=='sandbox';
  for(const name of ['course','sandbox']){$(name+'-mode').classList.toggle('active',mode===name);$(name+'-mode').setAttribute('aria-pressed',mode===name);}
}
function renderHeader(){
  const course=mode==='course';
  document.body.dataset.mode=mode;
  $('lesson-number').textContent=course?`УРОВЕНЬ ${String(state.current).padStart(2,'0')} / 20`:'ПЕСОЧНИЦА';
  $('lesson-category').textContent=course?level().concept:sandboxSource==='shared'?'Задача по ссылке':'Свободная практика';
  $('level-title').textContent=course?level().title:sandbox.title||'Моя задача';
  $('level-description').textContent=course?level().description:'Создай поле и программу. Сохрани проект для себя или отправь задачу другу.';
  $('task-title').textContent=$('level-title').textContent;$('task-copy').textContent=$('level-description').textContent;
  $('course-save-status').hidden=!course;$('task-button').hidden=!course;
  $('pagination').hidden=!course;$('sandbox-settings').hidden=course;$('field-editor').hidden=course;$('hint-button').hidden=!course;
  if(!course){$('sandbox-title').value=sandbox.title;$('sandbox-rows').value=sandbox.scene.rows;$('sandbox-cols').value=sandbox.scene.cols;$('goal-enabled').checked=!!sandbox.scene.goal;$('paint-enabled').checked=sandbox.scene.targets!==null;}
}
function renderVariants(){
  $('variants').hidden=mode!=='course'||level().scenes.length===1;
  $('variants').innerHTML=level().scenes.map((_,i)=>`<button data-variant="${i}" class="${variant===i?'active':''} ${variantResults?variantResults[i].status==='success'?'variant-pass':'variant-fail':''}" aria-pressed="${variant===i}" aria-label="Поле ${i+1}${variantResults?variantResults[i].status==='success'?', пройдено':', есть ошибка':''}">Поле ${i+1}${variantResults&&variantResults[i].status!=='success'?' !':''}</button>`).join('')+(variantResults?`<span class="variant-summary">Пройдено ${variantResults.filter(r=>r.status==='success').length} из ${level().scenes.length}</span>`:'');
}
function renderBoard(){
  const s=scene(),painted=new Set(world.painted),edges=new Map();
  const opposite={up:'down',right:'left',down:'up',left:'right'};
  for(const edge of s.edges){const [a,b]=edgeCells(edge);for(const [p,dir] of [[a,edge[2]],[b,opposite[edge[2]]]]){const k=cellKey(p);edges.set(k,[...(edges.get(k)||[]),dir]);}}
  const cells=$('board-cells');cells.style.gridTemplateColumns=`repeat(${s.cols},1fr)`;cells.style.gridTemplateRows=`repeat(${s.rows},1fr)`;
  cells.innerHTML=Array.from({length:s.rows*s.cols},(_,i)=>{
    const p=[Math.floor(i/s.cols),i%s.cols],key=cellKey(p),wall=s.blocks.some(b=>sameCell(b,p)),goal=sameCell(s.goal,p),target=s.targets?.some(b=>sameCell(b,p)),start=sameCell(s.start,p);
    const missing=world.missing?.includes(key),extra=world.extra?.includes(key),collision=sameCell(world.blocked?.next,p);
    const classes=['cell',wall?'wall':'',goal?'goal':'',target?'target':'',painted.has(key)?'painted':'',start?'start':'',sameCell(edgeCell,p)?'selected-cell':'',missing?'paint-missing':'',extra?'paint-extra':'',collision?'collision':''].join(' ');
    const tag=mode==='sandbox'?'button':'div';
    const label=`Строка ${p[0]+1}, столбец ${p[1]+1}${start?', старт Роби':''}${goal?', станция':''}${wall?', камень':''}${target?', закрасить':''}${painted.has(key)?', закрашено':''}${edges.has(key)?', стены: '+edges.get(key).map(d=>DIRECTIONS[d].sensor).join(', '):''}`;
    return `<${tag} class="${classes}" ${mode==='sandbox'?`data-cell="${key}" aria-label="${h(label+(missing?', нужно закрасить':extra?', лишняя закраска':''))}" ${busy()?'disabled':''}`:`title="${h(label)}"`}>${goal?'<span class="goal-symbol" aria-hidden="true">ϟ</span>':''}${missing||extra?`<span class="diagnostic-mark" aria-hidden="true">${missing?'!':'×'}</span>`:''}${(edges.get(key)||[]).map(dir=>`<span class="edge-line edge-${dir} ${sameCell(world.blocked?.from,p)&&world.blocked.direction===dir?'blocked-edge':''}" aria-hidden="true"></span>`).join('')}</${tag}>`;
  }).join('');
  $('board').style.aspectRatio=`${s.cols}/${s.rows}`;
  $('board').dataset.boundary=world.status==='boundary'?world.blocked?.direction||'':'';
  $('board').setAttribute('role',mode==='sandbox'?'group':'img');
  $('board').setAttribute('aria-label',`Поле ${s.rows} на ${s.cols}. Роби: строка ${world.position[0]+1}, столбец ${world.position[1]+1}.${s.goal?` Станция: строка ${s.goal[0]+1}, столбец ${s.goal[1]+1}.`:''}${s.targets!==null?` Клеток для закрашивания: ${s.targets.length}.`:''}`);
  const robot=$('robot-position');robot.style.width=100/s.cols+'%';robot.style.height=100/s.rows+'%';robot.style.left=world.position[1]*100/s.cols+'%';robot.style.top=world.position[0]*100/s.rows+'%';
  $('board-size').textContent=`${s.rows} × ${s.cols}`;$('paint-legend').hidden=s.targets===null;
  renderEdgeTools();fitBoard();
}
function fitBoard(){const wrap=document.querySelector('.board-wrap');if(!wrap||!training)return;const s=scene(),padding=phone.matches?8:16,width=Math.min(wrap.clientWidth-padding,(wrap.clientHeight-padding)*s.cols/s.rows,380);if(width>0)$('board').style.width=Math.floor(width)+'px';}
const boardResize=new ResizeObserver(()=>requestAnimationFrame(fitBoard));boardResize.observe(document.querySelector('.board-wrap'));
function findNode(id){let found=null;walkProgram(program(),(n,info)=>{if(n.id===id)found={node:n,...info};});return found;}
function rootList(){return scope==='main'?program().main:program().procedures[scope];}
function targetList(){if(!insertion.id)return rootList();const n=findNode(insertion.id)?.node;return n?.[insertion.branch]||rootList();}
function label(n){return n.type==='move'?DIRECTIONS[n.direction].label:n.type==='paint'?'Закрасить':n.type==='repeat'?`Повторить ${n.count} раз`:n.type==='if'?`Если ${CONDITIONS[n.condition]}`:n.type==='while'?`Пока ${CONDITIONS[n.condition]}`:`Вызвать ${n.name}`;}
function symbol(n){return n.type==='move'?DIRECTIONS[n.direction].symbol:({paint:'▨',repeat:'↻',if:'◇',while:'⟳',call:'↪'})[n.type];}
function blockControl(n){
  let choices=[],value;
  if(n.type==='move'){choices=Object.entries(DIRECTIONS).map(([k,d])=>[k,d.label]);value=n.direction;}
  else if(n.type==='repeat'){choices=Array.from({length:10},(_,i)=>[i+1,`${i+1} раз`]);value=n.count;}
  else if(n.type==='if'||n.type==='while'){choices=Object.entries(CONDITIONS);value=n.condition;}
  else if(n.type==='call'){choices=PROCEDURES.map(name=>[name,`алгоритм ${name}`]);value=n.name;}
  if(!choices.length)return '';
  return `<select class="block-value" data-value="${n.id}" ${selected===n.id?'id="block-value"':''} aria-label="Параметр блока: ${h(label(n))}" data-edit>${choices.map(([k,text])=>`<option value="${k}" ${String(value)===String(k)?'selected':''}>${h(text)}</option>`).join('')}</select>`;
}
function blockList(list,parent=null,branch=null){
  return `<div class="block-list ${parent?'':'root-list'}">${list.map(n=>{
    let inside='';
    if(n.type==='repeat'||n.type==='while')inside=blockList(n.body,n.id,'body');
    if(n.type==='if')inside=`<p class="branch-label">То</p>${blockList(n.then,n.id,'then')}<p class="branch-label">Иначе · можно оставить пустым</p>${blockList(n.else,n.id,'else')}`;
    const short=n.type==='repeat'?'Повторить':n.type==='if'?'Если':n.type==='while'?'Пока':n.type==='call'?'Вызвать':n.type==='paint'?'Закрасить':'';
    return `<div class="block ${inside?'control':''} ${selected===n.id?'selected':''}" data-block="${n.id}"><div class="block-header"><button class="block-head" data-select="${n.id}" aria-label="${h(label(n))}" aria-pressed="${selected===n.id}"><span class="block-symbol" aria-hidden="true">${symbol(n)}</span><span>${h(short)}</span></button>${blockControl(n)}</div>${inside}${inside?`<button class="after-insert" data-after="${n.id}" data-edit>＋ После ${n.type==='if'?'условия':'цикла'}</button>`:''}</div>`;
  }).join('')}<button class="insert-button ${!selected&&insertion.id===parent&&insertion.branch===branch?'active':''}" data-insert="${parent||''}" data-branch="${branch||''}" data-edit>＋ ${!parent?(scope==='main'?'В конец программы':'В конец алгоритма'):branch==='body'?'Внутрь цикла':branch==='then'?'В ветку «то»':'В ветку «иначе»'}</button></div>`;
}
function renderEditor(){
  const focused=document.activeElement?.dataset?.value,scroll=$('program').scrollTop;
  const p=program(),valid=validateProgram(p,{draft:true});$('program-count').textContent=valid.count||0;
  $('block-editor').hidden=view!=='blocks';$('code-panel').hidden=view!=='code';$('copy-code').hidden=view!=='code';
  $('blocks-view').setAttribute('aria-pressed',view==='blocks');$('code-view').setAttribute('aria-pressed',view==='code');
  $('algorithm-tabs').hidden=!allowed().includes('call');
  $('algorithm-tabs').innerHTML=['main',...PROCEDURES].map(name=>`<button data-scope="${name}" class="${scope===name?'active':''}" aria-pressed="${scope===name}">${name==='main'?'Основная':name}</button>`).join('');
  $('program').innerHTML=blockList(rootList());
  $('program').scrollTop=scroll;
  $('direction-palette').innerHTML=Object.entries(DIRECTIONS).map(([dir,d])=>`<button class="direction-button" data-direction="${dir}" data-edit aria-label="${d.label}"><span class="arrow" aria-hidden="true">${d.symbol}</span><span class="direction-name">${d.label}</span></button>`).join('');
  $('command-palette').innerHTML=[['paint','▨ Закрасить'],['repeat','↻ Повторить'],['if','◇ Если'],['while','⟳ Пока'],['call','↪ Вызвать']].filter(([type])=>allowed().includes(type)).map(([type,text])=>`<button data-type="${type}" data-edit>${text}</button>`).join('');
  const item=selected&&findNode(selected),tools=$('selection-tools');tools.hidden=!item;
  if(item){
    tools.innerHTML=`<span class="tool-label">Выбранный блок</span><button class="small-tool" id="move-earlier" aria-label="Переместить команду раньше" data-edit>↑</button><button class="small-tool" id="move-later" aria-label="Переместить команду позже" data-edit>↓</button><button class="small-tool" id="delete-block" aria-label="Удалить выбранную команду" data-edit>×</button>`;
    $('move-earlier').disabled=busy()||item.index===0;$('move-later').disabled=busy()||item.index===item.list.length-1;
  }
  const target=insertion.id&&findNode(insertion.id)?.node;
  $('insert-caption').textContent=item?`Добавляем после «${label(item.node)}»`:`Добавляем: ${scope==='main'?'основная программа':`алгоритм ${scope}`}${target?` → ${label(target)}${insertion.branch==='else'?' → иначе':''}`:''}`;
  const code=generateCode(p);$('kumir-code').innerHTML=code.lines.map(l=>`<span class="code-line"${l.id?` data-code="${l.id}"`:''}>${h(l.text)||' '}</span>`).join('');
  $('palette-count').textContent=`В программе блоков: ${valid.count||0}`;
  $('palette-slot').hidden=view!=='blocks';highlight();syncControls();
  if(focused)$('program').querySelector(`[data-value="${focused}"]`)?.focus({preventScroll:true});
}
function highlight(){
  document.querySelectorAll('[data-block],[data-code]').forEach(el=>{const id=el.dataset.block||el.dataset.code;el.classList.toggle('executing',id===activeId);el.classList.toggle('failed',id===failedId);});
  const container=view==='code'?$('kumir-code'):$('program');const el=container.querySelector('.executing>.block-header,.code-line.executing,.failed>.block-header');
  if(el){const box=container.getBoundingClientRect(),rect=el.getBoundingClientRect();if(rect.bottom>box.bottom||rect.top<box.top)container.scrollTop+=rect.top-box.top-container.clientHeight/3;}
}
function syncControls(){
  document.querySelectorAll('[data-edit]').forEach(el=>el.disabled=busy());
  document.querySelectorAll('[data-level],[data-variant]').forEach(el=>el.disabled=busy());
  for(const id of ['chapter-select','course-mode','sandbox-mode','copy-course','hint-button','load-solution'])$(id).disabled=busy();
  $('prev-level').disabled=busy()||state.current===1;$('next-level').disabled=busy()||state.current===LEVELS.length;
  $('clear-program').disabled=busy()||!validateProgram(program(),{draft:true}).count;
  $('undo-button').disabled=busy()||!history.canUndo(historyKey());
  $('run-button').textContent=run?.status==='running'?'Ⅱ Пауза':run?.status==='paused'?'▶ Продолжить':'▶ Запустить';
  $('step-button').disabled=run?.status==='running';$('stop-button').disabled=!busy();
  if(selected){const item=findNode(selected);if(item){$('move-earlier').disabled=busy()||item.index===0;$('move-later').disabled=busy()||item.index===item.list.length-1;}}
}
function render(){renderNavigation();renderHeader();renderVariants();renderBoard();renderEditor();syncControls();syncShell();}
function edited(){variantResults=null;saveProgram();resetWorld();renderVariants();renderBoard();renderEditor();$('board-status').textContent='Роби ждёт твоих команд';ready();}
function changeProgram(fn){if(busy())return;const before=editSnapshot(),previous=clone(program()),oldSelected=selected,oldInsertion={...insertion};fn();const valid=validateProgram(program(),{draft:true,allowed:allowed()});if(!valid.ok){if(mode==='course')entry().program=previous;else sandbox.program=previous;selected=oldSelected;insertion=oldInsertion;feedback('error','Блок пока не добавлен',valid.message);renderEditor();return;}history.record(historyKey(),before,editSnapshot());edited();}
function addBlock(n){changeProgram(()=>{const list=targetList(),index=list.findIndex(item=>item.id===selected);list.splice(index<0?list.length:index+1,0,n);selected=n.id;if(['repeat','while','if'].includes(n.type)){selected=null;insertion={id:n.id,branch:n.type==='if'?'then':'body'};}});}
function findParent(list,id=null,branch=null){if(list===findNode(selected)?.list)return{id,branch};for(const n of list){for(const key of ['body','then','else'])if(n[key]){const found=findParent(n[key],n.id,key);if(found)return found;}}return null;}

$('program').onclick=e=>{
  if(busy())return;
  const block=e.target.closest('[data-select]'),target=e.target.closest('[data-insert]'),after=e.target.closest('[data-after]');
  if(block||after){selected=block?.dataset.select||after.dataset.after;insertion=findParent(rootList())||{id:null,branch:null};}
  else if(target){selected=null;insertion={id:target.dataset.insert||null,branch:target.dataset.branch||null};}
  else return;renderEditor();if(target||after)openPalette();
};
$('algorithm-tabs').onclick=e=>{const b=e.target.closest('[data-scope]');if(!b)return;scope=b.dataset.scope;selected=null;insertion={id:null,branch:null};renderEditor();};
$('direction-palette').onclick=e=>{const b=e.target.closest('[data-direction]');if(b){addBlock(move(b.dataset.direction));$('direction-palette').querySelector(`[data-direction="${b.dataset.direction}"]`)?.focus({preventScroll:true});}};
$('command-palette').onclick=e=>{const b=e.target.closest('[data-type]');if(!b)return;const creators={paint,repeat:()=>repeat(2,[]),if:()=>when('free:right',[]),while:()=>until('free:right',[]),call:()=>call('А')};addBlock(creators[b.dataset.type]());};
$('program').onchange=e=>{const id=e.target.dataset.value;if(!id)return;const value=e.target.value;selected=id;insertion=findParent(rootList())||{id:null,branch:null};changeProgram(()=>{const n=findNode(id).node;if(n.type==='move')n.direction=value;else if(n.type==='repeat')n.count=Number(value);else if(n.type==='call')n.name=value;else n.condition=value;});};
$('selection-tools').onclick=e=>{const id=e.target.closest('button')?.id;if(!['move-earlier','move-later','delete-block'].includes(id))return;changeProgram(()=>{const item=findNode(selected);if(id==='delete-block'){item.list.splice(item.index,1);selected=null;}else{const index=item.index+(id==='move-earlier'?-1:1);if(index<0||index>=item.list.length)return;[item.list[item.index],item.list[index]]=[item.list[index],item.list[item.index]];}});};
$('clear-program').onclick=()=>confirmAction('Очистить программу?','Будут удалены команды основной программы и алгоритмов А/Б/В. Результат уровня сохранится.',()=>changeProgram(()=>{if(mode==='course')entry().program=emptyProgram();else sandbox.program=emptyProgram();scope='main';selected=null;insertion={id:null,branch:null};}));
for(const tab of ['blocks','code'])$(tab+'-view').onclick=()=>{view=tab;renderEditor();};

function navigate(id,keepPicker=false){if(busy())return;enterTraining();if(!keepPicker)$('journey-dialog').close();state.current=id;variant=0;scope='main';selected=null;insertion={id:null,branch:null};variantResults=null;edgeCell=null;$('hint-panel').hidden=true;$('solution-panel').hidden=true;resetWorld();persist();render();$('board-status').textContent='Роби ждёт твоих команд';ready();}
$('level-list').onclick=e=>{const b=e.target.closest('[data-level]');if(b)navigate(Number(b.dataset.level));};
$('chapter-select').onchange=e=>navigate(LEVELS.find(l=>l.chapter===e.target.value).id,true);
$('prev-level').onclick=()=>navigate(state.current-1);$('next-level').onclick=()=>navigate(state.current+1);
function selectVariant(index){if(busy())return;variant=index;resetWorld();if(variantResults){world=variantResults[index];activeId=world.nodeId||world.frames.at(-1)?.nodeId;failedId=world.nodeId||null;scope=findNode(activeId)?.scope||'main';feedback(world.status==='success'?'success':'error',`Поле ${index+1}: ${world.status==='success'?'пройдено':'есть ошибка'}`,world.message);}$('board-status').textContent=variantResults?`Результат поля ${index+1}`:`Поле ${index+1}. Программа общая для всех вариантов.`;renderVariants();renderBoard();renderEditor();syncControls();}
$('variants').onclick=e=>{const b=e.target.closest('[data-variant]');if(b)selectVariant(Number(b.dataset.variant));};
function switchMode(next){if(busy())return;enterTraining();mode=next;scope='main';selected=null;insertion={id:null,branch:null};edgeCell=null;variantResults=null;$('hint-panel').hidden=true;resetWorld();render();$('board-status').textContent='Роби ждёт твоих команд';ready();if(next==='sandbox'&&!settingsOpened&&sandboxSource!=='shared'){settingsOpened=true;openFieldSettings();}}
$('course-mode').onclick=()=>switchMode('course');$('sandbox-mode').onclick=()=>switchMode('sandbox');

function startExecution(automatic){
  const valid=validateProgram(program(),{allowed:allowed()}),field=validateScene(scene());
  if(!valid.ok||!field.ok){feedback('error','Проверим программу',valid.message||field.message);return false;}
  resetWorld();variantResults=null;renderVariants();
  if(mode==='course'){entry().attempts++;persist();}
  selected=null;run={iterator:execute(clone(scene()),clone(program()),mode==='course'?level():{}),status:automatic?'running':'paused',timer:null};
  renderEditor();renderBoard();feedback('','Выполняем программу','Следи за подсветкой. «Стоп» вернёт поле к началу и позволит изменить команды.');return true;
}
function finishExecution(result){
  run=null;world=result;failedId=result.nodeId||null;renderBoard();highlight();
  if(mode==='course'){
    const checked=verifyLevel(level(),program());variantResults=checked.results;renderVariants();
    if(checked.success){const e=entry();e.completed=true;e.independent=e.independent||(!e.hintUsed&&!e.solutionUsed);persist();renderNavigation();feedback('success',level().scenes.length>1?'Получилось на всех трёх полях!':'Получилось! Роби выполнил задачу.',level().takeaway,state.current<20?{label:'Следующий уровень →',fn:()=>navigate(state.current+1)}:{label:'Создать свою задачу →',fn:()=>switchMode('sandbox')});}
    else{const i=result.status!=='success'?variant:checked.results.findIndex(r=>r.status!=='success');feedback('error',level().scenes.length>1?`Пройдено ${checked.results.filter(r=>r.status==='success').length} из ${level().scenes.length}. Проверь поле ${i+1}.`:'Есть что поправить',checked.results[i].message,i!==variant?{label:`Посмотреть поле ${i+1} →`,fn:()=>selectVariant(i)}:undefined);}
  }else if(mode==='sandbox'&&['success','finished'].includes(result.status)){feedback('success',result.status==='success'?'Твоя задача решена!':'Эксперимент завершён.',result.status==='success'?'Программа выполнила цель. Можно сохранить проект или поделиться задачей.':'У этого поля нет цели. Добавь станцию или клетки для закрашивания, если хочешь поделиться задачей.');}
  else feedback('error','Есть что поправить',result.message);
  $('board-status').textContent=`Выполнение завершено · операций: ${result.operations}`;syncControls();
}
function advance(){
  if(!run)return;const next=run.iterator.next();if(next.done){run=null;syncControls();return;}
  const frame=next.value;if(frame.kind==='finish'){finishExecution(frame.result);return;}
  world=frame;activeId=frame.nodeId;failedId=frame.kind==='error'?frame.nodeId:null;
  if(frame.scope&&scope!==frame.scope){scope=frame.scope;insertion={id:null,branch:null};renderEditor();}
  renderBoard();highlight();$('board-status').textContent=`${frame.operations}. ${frame.detail}`;
}
function schedule(){if(run?.status!=='running')return;const delay=Number($('run-speed').value);run.timer=setTimeout(()=>{if(run?.status!=='running')return;advance();schedule();},delay);}
$('run-button').onclick=()=>{
  if(run?.status==='running'){clearTimeout(run.timer);run.status='paused';syncControls();feedback('','Пауза','Продолжи по одному шагу или нажми «Продолжить». Чтобы изменить программу, нажми «Стоп».');return;}
  if(run){run.status='running';syncControls();schedule();return;}
  if(startExecution(true)){advance();schedule();}
};
$('step-button').onclick=()=>{if(run?.status==='running')return;if(!run&&!startExecution(false))return;advance();syncControls();};
function stopExecution(){if(run)clearTimeout(run.timer);run=null;resetWorld();renderBoard();renderEditor();$('board-status').textContent='Роби вернулся на старт';feedback('','Запуск остановлен','Программа сохранена. Можно изменить команды и попробовать ещё раз.');}
$('stop-button').onclick=stopExecution;

$('hint-button').onclick=()=>{entry().hintUsed=true;persist();$('hint-panel').hidden=false;$('hint-copy').textContent=level().hint;$('task-dialog').showModal();};
$('solution-button').onclick=()=>{entry().solutionUsed=true;persist();$('solution-panel').hidden=false;$('solution-code').textContent=generateCode(level().solution).text;};
$('load-solution').onclick=()=>{const before=editSnapshot();entry().program=clone(level().solution);history.record(historyKey(),before,editSnapshot());scope='main';selected=null;insertion={id:null,branch:null};$('task-dialog').close();edited();feedback('','Решение в редакторе','Запусти по шагам и посмотри, почему оно работает. Этот уровень будет отмечен как пройденный с решением.');};

function renderResults(){
  const completed=LEVELS.filter(l=>state.levels[l.id].completed).length,independent=LEVELS.filter(l=>state.levels[l.id].independent).length;
  $('results-content').innerHTML=`<img class="results-robot" src="./assets/robot.svg" alt=""><h2>${completed===20?'Ты управляешь алгоритмами!':'Каждый шаг — открытие'}</h2><p class="results-intro">Можно вернуться к любому уровню и попробовать ещё раз.</p><div class="result-stats"><div class="result-stat"><b>${completed}/20</b><span>уровней пройдено</span></div><div class="result-stat"><b>${independent}</b><span>самостоятельно</span></div></div><div class="result-levels">${LEVELS.map(l=>{const e=state.levels[l.id];return `<div class="result-row"><span class="result-level-num">${l.id}</span><span class="result-level-title">${h(l.title)}</span><span class="result-label ${e.completed?'done':''}">${!e.completed?'Впереди':e.independent?'Самостоятельно':e.solutionUsed?'С решением':'С подсказкой'}</span></div>`;}).join('')}</div><button class="reset-link" id="reset-progress">Сбросить весь прогресс</button>`;
  $('reset-progress').disabled=busy();$('reset-progress').onclick=()=>{$('results-dialog').close();confirmAction('Начать маршрут заново?','Будут удалены программы и результаты всех 20 уровней. Песочница сохранится.',()=>{state=freshState(LEVELS);for(const l of LEVELS)history.clear(`level-${l.id}`);persist();mode='course';navigate(1);});};
  const backupButton=document.createElement('button');backupButton.className='primary-button wide-button';backupButton.id='all-saves';backupButton.textContent='Перенести все сохранения ↗';backupButton.disabled=busy();backupButton.onclick=()=>{$('results-dialog').close();openBackup();};$('results-content').prepend(backupButton);
}
for(const id of ['journey-count','progress-button','quick-results'])$(id).onclick=()=>{renderResults();$('journey-dialog').close();$('results-dialog').showModal();};
$('help-button').onclick=()=>$('help-dialog').showModal();$('help-done').onclick=()=>$('help-dialog').close();
$('start-button').onclick=()=>{enterTraining();$('workspace').focus({preventScroll:true});};
$('home-button').onclick=home;
document.querySelector('.brand').onclick=e=>{e.preventDefault();home();};
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();enterTraining();$('workspace').focus();};
$('levels-button').onclick=()=>$('journey-dialog').showModal();
$('task-button').onclick=()=>$('task-dialog').showModal();
$('add-command').onclick=openPalette;$('close-palette').onclick=()=>$('palette-dialog').close();
$('undo-button').onclick=undoEdit;
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&!e.target.closest('input,textarea,select,[contenteditable]')&&!document.querySelector('dialog[open]')){e.preventDefault();undoEdit();}});

function renderEdgeTools(){
  const visible=mode==='sandbox'&&$('field-tool').value==='edge'&&!!edgeCell;$('edge-tools').hidden=!visible;
  $('edge-cell-label').textContent=edgeCell?`Клетка ${edgeCell[0]+1}:${edgeCell[1]+1}. Выбери сторону стены.`:'Сначала выбери клетку на поле.';
  $('edge-directions').innerHTML=Object.entries(DIRECTIONS).map(([dir,d])=>`<button data-edge="${dir}" aria-label="Стена ${d.sensor}" ${!edgeCell||busy()||!inBounds(scene(),[edgeCell[0]+d.dr,edgeCell[1]+d.dc])?'disabled':''}>${d.symbol}</button>`).join('');
}
function fieldChanged(){const valid=validateScene(sandbox.scene);if(!valid.ok){feedback('error','Проверь поле',valid.message);return;}markDirty();resetWorld();renderBoard();renderHeader();syncControls();ready();}
function mutateField(fn){if(busy())return;const before=clone(sandbox);fn();const valid=validateScene(sandbox.scene);if(!valid.ok){sandbox=before;feedback('error','Так разместить не получится',valid.message);return;}history.record('sandbox',before,sandbox);fieldChanged();}
$('field-tool').onchange=()=>{edgeCell=null;renderBoard();$('field-help').textContent=$('field-tool').value==='edge'?'Выбери клетку, затем сторону стены. Повторное нажатие убирает стену.':'Нажми на клетку. Повторное нажатие убирает отметку.';};
$('board-cells').onclick=e=>{
  const b=e.target.closest('[data-cell]');if(!b||busy())return;const p=b.dataset.cell.split(',').map(Number),tool=$('field-tool').value;
  if(tool==='edge'){edgeCell=p;renderBoard();return;}
  mutateField(()=>{
    const s=sandbox.scene;
    if(tool==='start'){s.start=p;return;}if(tool==='goal'){s.goal=p;return;}
    if(tool==='erase'){s.blocks=s.blocks.filter(c=>!sameCell(c,p));s.initialPaint=s.initialPaint.filter(c=>!sameCell(c,p));if(s.targets)s.targets=s.targets.filter(c=>!sameCell(c,p));if(sameCell(s.goal,p))s.goal=null;s.edges=s.edges.filter(edge=>!edgeCells(edge).some(c=>sameCell(c,p)));return;}
    if(tool==='targets'&&s.targets===null)s.targets=[];
    const list=s[tool],index=list.findIndex(c=>sameCell(c,p));if(index>=0)list.splice(index,1);else list.push(p);
  });
};
$('board-cells').onkeydown=e=>{const b=e.target.closest('[data-cell]'),dir={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left'}[e.key];if(!b||!dir)return;e.preventDefault();const p=b.dataset.cell.split(',').map(Number),d=DIRECTIONS[dir];$('board-cells').querySelector(`[data-cell="${p[0]+d.dr},${p[1]+d.dc}"]`)?.focus();};
$('edge-directions').onclick=e=>{const b=e.target.closest('[data-edge]');if(!b||!edgeCell)return;mutateField(()=>{const edge=[...edgeCell,b.dataset.edge],key=edgeKey(...edgeCells(edge));const index=sandbox.scene.edges.findIndex(w=>edgeKey(...edgeCells(w))===key);if(index>=0)sandbox.scene.edges.splice(index,1);else sandbox.scene.edges.push(edge);edgeCell=null;});};
$('close-edge').onclick=()=>{edgeCell=null;renderBoard();};
$('goal-enabled').onchange=e=>mutateField(()=>{sandbox.scene.goal=e.target.checked?[...sandbox.scene.start]:null;});
$('paint-enabled').onchange=e=>mutateField(()=>{sandbox.scene.targets=e.target.checked?[]:null;});
$('sandbox-title').onfocus=()=>{titleBefore=clone(sandbox);};
$('sandbox-title').oninput=e=>{sandbox.title=e.target.value;$('level-title').textContent=sandbox.title||'Моя задача';markDirty();};
$('sandbox-title').onchange=()=>{if(titleBefore)history.record('sandbox',titleBefore,sandbox);titleBefore=null;syncControls();};
for(const id of ['sandbox-rows','sandbox-cols'])$(id).onchange=()=>{const rows=Number($('sandbox-rows').value),cols=Number($('sandbox-cols').value);renderHeader();confirmAction('Изменить размер поля?','Поле будет очищено. Программа останется в редакторе.',()=>mutateField(()=>{sandbox.scene=makeScene({rows,cols,start:[rows-1,0],goal:[rows-1,cols-1]});edgeCell=null;}));};
function replaceSandbox(project,source='draft') {if(source!=='shared')history.record('sandbox',sandbox,project);else history.clear('sandbox');sandbox=project;sandboxSource=source;sandboxDirty=true;edgeCell=null;scope='main';selected=null;insertion={id:null,branch:null};mode='sandbox';enterTraining();resetWorld();render();markDirty();ready();}
function replaceWithConfirmation(title,fn){confirmAction(title,'Текущее поле и программа песочницы будут заменены. Сохрани нужный проект перед заменой.',fn);}
$('new-project').onclick=()=>replaceWithConfirmation('Создать новое поле?',()=>{replaceSandbox(blankProject());openFieldSettings();});
$('copy-course').onclick=()=>replaceWithConfirmation('Взять поле текущего уровня?',()=>replaceSandbox({...blankProject(),title:level().title,scene:clone(level().scenes[variant])}));
$('save-project').onclick=()=>{try{const data=exportProject(sandbox);storage.setItem(SANDBOX_KEY,data);sandboxDirty=false;sandboxSource='draft';$('sandbox-save-status').textContent='Сохранено в этом браузере. Кнопка «Мой черновик» вернёт этот проект.';renderHeader();}catch(error){notice();feedback('error','Не удалось сохранить',error.message+' Можно скачать проект в файл.');}};
$('load-project').onclick=()=>{try{const raw=storage.getItem(SANDBOX_KEY);if(!raw){feedback('','Пока нет черновика','Сохрани проект кнопкой «Сохранить».');return;}const project=importProject(raw);replaceWithConfirmation('Открыть сохранённый черновик?',()=>{replaceSandbox(project);sandboxDirty=false;$('sandbox-save-status').textContent='Открыт сохранённый черновик.';});}catch(error){feedback('error','Не удалось открыть черновик',error.message);}};
$('export-project').onclick=()=>{try{const data=exportProject(sandbox),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='robokhod-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('sandbox-save-status').textContent='Файл проекта скачан. В нём поле и программа.';}catch(error){feedback('error','Проверь проект',error.message);}};
$('import-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>131072)throw Error('Файл слишком большой. Максимум — 128 КБ.');const project=importProject(await file.text());replaceWithConfirmation('Открыть проект из файла?',()=>{replaceSandbox(project,'file');$('sandbox-save-status').textContent='Проект открыт из файла. Сохранённый черновик не изменён.';});}catch(error){feedback('error','Файл не открыт',error.message);}};
async function copyText(text){if(!navigator.clipboard?.writeText)throw Error('Копирование недоступно. Выдели текст и скопируй вручную.');await navigator.clipboard.writeText(text);}
$('copy-code').onclick=async()=>{try{await copyText(generateCode(program()).text);$('copy-code').textContent='Скопировано';setTimeout(()=>$('copy-code').textContent='Копировать',1600);}catch{feedback('','Код можно выделить','Выдели код КуМир и скопируй его сочетанием Ctrl+C или через меню телефона.');}};
$('share-project').onclick=()=>{try{$('share-url').value=location.origin+location.pathname+encodeTask(sandbox);$('share-status').textContent='';$('share-dialog').showModal();}catch(error){feedback('error','Добавь цель задачи',error.message);}};
$('copy-share').onclick=async()=>{try{await copyText($('share-url').value);$('share-status').textContent='Ссылка скопирована. Отправь её другу.';}catch{$('share-url').focus();$('share-url').select();$('share-status').textContent='Скопируй выделенную ссылку через меню или Ctrl+C.';}};
function openShared(){if(!location.hash.startsWith('#task='))return;try{replaceSandbox(decodeTask(location.hash),'shared');sandboxDirty=false;$('sandbox-save-status').textContent='Задача открыта без решения. Твой сохранённый черновик не изменён.';feedback('','Задача по ссылке','Составь своё решение. «Сохранить» запишет этот проект вместо твоего черновика.');}catch(error){enterTraining();feedback('error','Не удалось открыть ссылку',error.message+' Твой прогресс и черновик сохранены.');}}
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#task='))return;if(busy()){clearTimeout(run.timer);run=null;}openShared();syncControls();});
window.addEventListener('beforeunload',e=>{if(sandboxDirty){e.preventDefault();e.returnValue='';}});
function openFieldSettings(){if(busy())return;$('field-settings-button').setAttribute('aria-expanded','true');$('field-settings-dialog').showModal();}
$('field-settings-body').append($('field-editor'));document.querySelector('.board-panel').append($('edge-tools'));
$('field-settings-button').onclick=openFieldSettings;$('field-settings-done').onclick=()=>$('field-settings-dialog').close();
$('field-settings-dialog').addEventListener('close',()=>{$('field-settings-button').setAttribute('aria-expanded','false');$('board-status').textContent=`Инструмент: ${$('field-tool').selectedOptions[0].textContent}. Нажми на клетку.`;});
$('project-menu-button').onclick=()=>$('project-menu').showModal();
$('copy-course-menu').onclick=()=>$('copy-course').click();
$('project-menu').addEventListener('click',e=>{if(e.target.closest('.project-menu-actions button'))$('project-menu').close();});
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openBackup(){pendingBackup=null;$('backup-preview').hidden=true;$('backup-status').textContent='';$('backup-dialog').showModal();}
$('download-backup').onclick=()=>{try{let saved=null;try{const raw=storage.getItem(SANDBOX_KEY);if(raw)saved=importProject(raw);}catch(error){if(loaded.storageOK)throw error;}
  const backup=createBackup({progress:state,sandboxSaved:saved,sandboxWorking:sandbox},LEVELS);downloadJSON(backup,'robokhod-backup.json');$('backup-status').textContent='Файл скачан. Для восстановления открой его здесь через «Восстановить из файла».';
}catch(error){$('backup-status').textContent='Не удалось создать копию: '+error.message;}};
$('open-backup').onclick=()=>$('backup-file').click();
$('backup-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';pendingBackup=null;$('backup-preview').hidden=true;if(!file)return;try{if(file.size>2097152)throw Error('Максимум — 2 МБ.');pendingBackup=parseBackup(await file.text(),LEVELS);const done=Object.values(pendingBackup.progress.levels).filter(e=>e.completed).length;$('backup-summary').textContent=`В файле: ${done} пройденных уровней, последний уровень — ${pendingBackup.progress.current}. Сохранённый проект: ${pendingBackup.sandboxSaved?.title||'нет'}. Текущий проект: ${pendingBackup.sandboxWorking?.title||'нет'}.`;$('backup-preview').hidden=false;$('backup-status').textContent='Файл проверен. Текущие данные пока не изменены.';}catch(error){$('backup-status').textContent='Файл не открыт: '+error.message;}};
$('restore-backup').onclick=()=>{if(!pendingBackup||busy())return;try{const backup=restoreBackup(storage,pendingBackup,LEVELS);state=backup.progress;sandbox=backup.sandboxWorking||backup.sandboxSaved||blankProject();sandboxDirty=JSON.stringify(sandbox)!==JSON.stringify(backup.sandboxSaved);sandboxSource='file';if(sandboxDirty)markDirty();else $('sandbox-save-status').textContent='Восстановлен сохранённый черновик.';history.clear();mode='course';navigate(state.current);$('backup-dialog').close();pendingBackup=null;feedback('success','Сохранения восстановлены','Программы и результаты перенесены. Текущий проект песочницы доступен во вкладке «Песочница».');}catch(error){$('backup-status').textContent=error.message;}};
resetWorld();render();ready();openShared();
