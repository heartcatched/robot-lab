import { LEVELS, DIRECTIONS } from './levels.js';
import { clone, simulate, expandProgram, loadState, freshState, STORAGE_KEY, MAX_BLOCKS } from './engine.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) };
let { state, storageOK } = loadState(storage, LEVELS);
let selected = null;
let running = false;
let runToken = 0;
let loopDraft = { count: 2, body: [] };
let loopEditIndex = null;
const level = () => LEVELS[state.current - 1];
const entry = () => state.levels[state.current];
const program = () => entry().program;
const countCompleted = () => Object.values(state.levels).filter(item => item.completed).length;
const trashIcon = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function persist() {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); storageOK = true; }
  catch { storageOK = false; }
  $('#storage-notice').hidden = storageOK;
}

function directionButtons(target, inLoop = false) {
  $(target).innerHTML = Object.entries(DIRECTIONS).map(([key, value]) => `<button class="direction-button" data-direction="${key}" aria-label="${inLoop ? 'В цикл: ' : 'Добавить: '}${value.label}"><span class="arrow" aria-hidden="true">${value.symbol}</span><span class="direction-name">${value.label}</span></button>`).join('');
}

function renderNavigation() {
  let group = '';
  $('#level-list').innerHTML = LEVELS.map(item => {
    const heading = item.group !== group ? `<div class="level-group">${escape(item.group)}</div>` : '';
    group = item.group;
    const complete = state.levels[item.id].completed;
    return `${heading}<button class="level-button ${item.id === state.current ? 'active' : ''} ${complete ? 'completed' : ''}" data-level="${item.id}" ${item.id === state.current ? 'aria-current="step"' : ''} aria-label="Уровень ${item.id}: ${escape(item.title)}${complete ? ', пройден' : ''}" ${running ? 'disabled' : ''}><span class="level-num">${complete ? '✓' : String(item.id).padStart(2, '0')}</span><span class="level-name">${escape(item.title)}</span>${item.id === state.current ? '<span class="level-current-arrow" aria-hidden="true">↗</span>' : ''}</button>`;
  }).join('');
  const completed = countCompleted();
  $('#journey-count').textContent = `${completed} / 8`;
  $('#progress-percent').textContent = `${Math.round(completed / 8 * 100)}%`;
  $('#progress-fill').style.width = `${completed / 8 * 100}%`;
  $('#progress-track').setAttribute('aria-valuenow', String(completed));
  $('#prev-level').disabled = running || state.current === 1;
  $('#next-level').disabled = running || state.current === 8;
}

function renderBoard() {
  const item = level();
  $('#board-cells').innerHTML = Array.from({ length: 25 }, (_, i) => {
    const r = Math.floor(i / 5), c = i % 5;
    const wall = item.walls.some(([wr, wc]) => wr === r && wc === c);
    const goal = item.goal[0] === r && item.goal[1] === c;
    const start = item.start[0] === r && item.start[1] === c;
    return `<div class="cell ${wall ? 'wall' : ''} ${goal ? 'goal' : ''} ${start ? 'start' : ''}" data-cell="${r}-${c}">${goal ? '<span class="goal-symbol" aria-hidden="true">ϟ</span>' : ''}</div>`;
  }).join('');
  const walls = item.walls.length ? ` Преграды (строка, столбец): ${item.walls.map(([r,c]) => `${r+1}, ${c+1}`).join('; ')}.` : ' Преград нет.';
  $('#board').setAttribute('aria-label', `Поле 5 на 5. Строки считаются сверху, столбцы слева. Роби: строка ${item.start[0]+1}, столбец ${item.start[1]+1}. Зарядка: строка ${item.goal[0]+1}, столбец ${item.goal[1]+1}.${walls}`);
  positionRobot(item.start, true);
  $('#board-status').textContent = 'Роби ждёт твоих команд';
}

function positionRobot(position, instant = false) {
  const robot = $('#robot-position');
  robot.classList.remove('error', 'charged');
  robot.classList.toggle('no-transition', instant);
  robot.style.top = `${position[0] * 20}%`;
  robot.style.left = `${position[1] * 20}%`;
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => robot.classList.remove('no-transition')));
}

function commandName(command) {
  return typeof command === 'string' ? DIRECTIONS[command].label : `Повторить ${command.count} раза: ${command.body.map(dir => DIRECTIONS[dir].label).join(', ')}`;
}

function renderProgram() {
  const commands = program();
  if (selected !== null && selected >= commands.length) selected = null;
  $('#program-count').textContent = String(commands.length);
  $('#program').classList.toggle('empty', commands.length === 0);
  $('#program').innerHTML = commands.length ? commands.map((command, i) => {
    const common = `data-index="${i}" aria-label="Команда ${i + 1}: ${escape(commandName(command))}" aria-pressed="${selected === i}" ${running ? 'disabled' : ''}`;
    if (typeof command === 'string') return `<button class="command ${selected === i ? 'selected' : ''}" ${common}><span class="command-index">${i+1}</span><span class="command-arrow" aria-hidden="true">${DIRECTIONS[command].symbol}</span><span class="command-label">${DIRECTIONS[command].label}</span></button>`;
    return `<button class="command loop-command ${selected === i ? 'selected' : ''}" ${common}><span class="loop-heading"><span class="command-index">${i+1}.</span> ↻ Повторить ${command.count} раза</span><span class="loop-directions" aria-hidden="true">${command.body.map((dir, n) => `<span data-inner="${n}">${DIRECTIONS[dir].symbol}</span>`).join('')}</span></button>`;
  }).join('') : '<div class="empty-program"><div class="empty-path" aria-hidden="true">⌁ → ⌁</div><b>Здесь начинается твой алгоритм</b><p>Добавляй команды стрелками ниже</p></div>';
  const tools = $('#selection-tools');
  tools.hidden = selected === null || running;
  if (selected !== null) {
    const command = commands[selected];
    tools.innerHTML = `<span class="tool-label">№ ${selected + 1}</span><button class="small-tool" data-action="earlier" aria-label="Переместить команду раньше" ${selected === 0 ? 'disabled' : ''}>←</button><button class="small-tool" data-action="later" aria-label="Переместить команду позже" ${selected === commands.length-1 ? 'disabled' : ''}>→</button>${typeof command === 'string' ? `<select class="replace-select" aria-label="Заменить выбранную команду">${Object.entries(DIRECTIONS).map(([key, dir]) => `<option value="${key}" ${key === command ? 'selected' : ''}>${dir.symbol} ${dir.label}</option>`).join('')}</select>` : '<button class="small-tool" data-action="edit-loop" aria-label="Изменить цикл">Изменить</button>'}<button class="small-tool" data-action="delete" aria-label="Удалить выбранную команду">${trashIcon}</button>`;
  }
  $('#palette-label').textContent = selected === null ? 'ДОБАВЬ КОМАНДУ' : `ДОБАВЬ ПОСЛЕ № ${selected+1}`;
  $('#clear-program').disabled = running || !commands.length;
  $('#loop-button').disabled = running || !level().requiresLoop || commands.length >= MAX_BLOCKS;
  $('#loop-access').textContent = level().requiresLoop ? '↗' : 'с уровня 5';
  $('#direction-palette').querySelectorAll('button').forEach(button => button.disabled = running || commands.length >= MAX_BLOCKS);
  $('#hint-button').disabled = running;
  $('#solution-button').disabled = running;
  $('#run-button').innerHTML = running ? '<span aria-hidden="true">■</span><span>Стоп</span>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z" fill="currentColor"/></svg><span>Запустить</span>';
  $('#workspace').classList.toggle('is-running', running);
}

function feedback(kind, title, text, action = null) {
  $('#feedback').className = `feedback ${kind}`;
  $('#feedback').innerHTML = `<span class="feedback-icon" aria-hidden="true">${kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'}</span><div class="feedback-copy"><b>${escape(title)}</b><p>${escape(text)}</p></div>${action ? `<button class="feedback-action" id="feedback-action">${escape(action.label)} <span aria-hidden="true">→</span></button>` : ''}`;
  if (action) $('#feedback-action').addEventListener('click', action.run);
}

function defaultFeedback() {
  if (level().id === 4) feedback('', 'Здесь спряталась ошибка', 'Запусти готовую программу. Потом выбери неверную команду и замени её в выпадающем списке.');
  else if (level().requiresLoop) feedback('', 'На этом уровне нужен цикл', 'Нажми «Повторить», задай число повторов и добавь команды внутрь.');
  else feedback('', 'Один маленький шаг — начало большого алгоритма', 'Добавь команды стрелками, затем нажми «Запустить». Роби выполнит их по порядку.');
}

function renderLevel() {
  const item = level();
  selected = null;
  $('#lesson-number').textContent = `УРОВЕНЬ ${String(item.id).padStart(2,'0')} / 08`;
  $('#lesson-category').textContent = item.concept;
  $('#level-title').textContent = item.title;
  $('#level-description').textContent = item.description;
  $('#hint-panel').hidden = true;
  $('#hint-button').setAttribute('aria-expanded', 'false');
  $('#hint-copy').textContent = item.hint;
  $('#solution-button').hidden = false;
  $('#solution-button').textContent = 'Показать решение ↗';
  $('#start-button').innerHTML = countCompleted() ? 'Продолжить тренировку <span aria-hidden="true">↗</span>' : 'Начать тренировку <span aria-hidden="true">↗</span>';
  renderNavigation(); renderBoard(); renderProgram(); defaultFeedback();
}

function switchLevel(id, focus = true) {
  if (id < 1 || id > 8) return;
  stopRun(false);
  state.current = id;
  persist(); renderLevel();
  if (focus) {
    $('#level-title').focus({ preventScroll: true });
    $('#workspace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}

function onEdit() {
  persist(); renderProgram(); renderBoard(); defaultFeedback();
}

function insertCommand(command) {
  if (running || program().length >= MAX_BLOCKS) return;
  const index = selected === null ? program().length : selected + 1;
  const candidate = clone(program());
  candidate.splice(index, 0, command);
  if (expandProgram(candidate).error) { feedback('error', 'Программа получилась слишком длинной', 'Можно выполнить не больше 80 шагов. Уменьши число повторов или удали лишние команды.'); return; }
  entry().program = candidate;
  selected = index;
  onEdit();
}

function highlight(frame, failed = false) {
  document.querySelectorAll('.command').forEach(command => command.classList.remove('executing', 'failed'));
  document.querySelectorAll('.inner-active').forEach(command => command.classList.remove('inner-active'));
  const command = $(`[data-index="${frame.index}"]`);
  command?.classList.add(failed ? 'failed' : 'executing');
  if (frame.inner !== null) command?.querySelector(`[data-inner="${frame.inner}"]`)?.classList.add('inner-active');
  if (command) $('#program').scrollTop = Math.max(0, command.offsetTop - $('#program').offsetTop - 45);
}

function stopRun(showMessage = true) {
  runToken++;
  const wasRunning = running;
  running = false;
  if (wasRunning) {
    renderProgram(); renderNavigation(); renderBoard();
    if (showMessage) feedback('', 'Запуск остановлен', 'Роби вернулся на старт. Программа сохранена — её можно изменить или запустить ещё раз.');
  }
}

async function run() {
  if (running) { stopRun(); return; }
  const result = simulate(level(), program());
  if (result.status === 'empty') {
    feedback('error', 'Роби пока не знает, куда идти', 'Добавь хотя бы одну команду стрелками под редактором.');
    $('#direction-palette button').focus({ preventScroll: true }); return;
  }
  if (['limit','invalid'].includes(result.status)) { feedback('error', 'Проверь программу', 'В программе может быть до 24 блоков и до 80 шагов. Цикл содержит от 1 до 8 команд.'); return; }
  const token = ++runToken;
  running = true;
  entry().attempts++;
  selected = null;
  persist(); renderBoard(); renderProgram(); renderNavigation();
  feedback('', 'Программа выполняется', 'Следи за подсвеченной командой. Именно её сейчас выполняет Роби.');
  const total = expandProgram(program()).steps.length;
  const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 440;
  for (const frame of result.frames) {
    if (token !== runToken) return;
    highlight(frame);
    $('#board-status').textContent = `Шаг ${frame.number} из ${total}${frame.iteration ? ` · повтор ${frame.iteration} из ${program()[frame.index].count}` : ''}`;
    await new Promise(resolve => setTimeout(resolve, delay));
    if (token !== runToken) return;
    positionRobot(frame.position);
    if (!frame.failure) $(`[data-cell="${frame.position.join('-')}"]`)?.classList.add('visited');
    else $('#robot-position').classList.add('error');
  }
  await new Promise(resolve => setTimeout(resolve, delay));
  if (token !== runToken) return;
  running = false;
  renderProgram(); renderNavigation();
  if (result.status === 'success') {
    entry().completed = true;
    entry().independent ||= !entry().hintUsed && !entry().solutionUsed;
    persist(); renderNavigation();
    $('#robot-position').classList.add('charged');
    $('#board-status').textContent = 'Зарядка началась. Отличная работа!';
    const last = state.current === 8;
    feedback('success', 'Есть контакт! Роби на зарядке.', level().takeaway, { label: last ? 'Мои результаты' : 'Дальше', run: () => last ? showResults() : switchLevel(state.current+1) });
  } else if (result.status === 'wall' || result.status === 'boundary') {
    const failed = result.frames.at(-1);
    highlight(failed, true);
    $('#board-status').textContent = `Остановка на шаге ${failed.number}. Попробуем исправить?`;
    const location = failed.inner === null ? `команду № ${failed.index+1}` : `команду ${failed.inner+1} внутри цикла № ${failed.index+1} (повтор ${failed.iteration})`;
    feedback('error', result.status === 'wall' ? `На шаге ${failed.number} — препятствие` : `На шаге ${failed.number} — край поля`, `Роби остался на безопасной клетке. Проверь ${location} и измени маршрут. Новый запуск начнётся со старта.`);
  } else if (result.status === 'needs-loop') {
    $('#board-status').textContent = 'Маршрут верный. Теперь попробуй цикл!';
    feedback('error', 'Доехали! Но задача ещё не закончена.', 'На этом уровне нужно использовать цикл. Найди повторяющиеся команды и объедини их кнопкой «Повторить».');
  } else {
    $('#board-status').textContent = 'Команды закончились. Станция ещё впереди.';
    feedback('error', 'Маршрут пока не привёл к станции', 'Роби выполнил все команды. Посмотри, где он остановился, и исправь или дополни программу.');
  }
}

function showHint() {
  if (running) return;
  const panel = $('#hint-panel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) { entry().hintUsed = true; persist(); }
  $('#hint-button').setAttribute('aria-expanded', String(!panel.hidden));
}

function showSolution() {
  if (running) return;
  entry().solutionUsed = true; entry().hintUsed = true; persist();
  $('#hint-copy').innerHTML = `${escape(level().hint)}<strong class="solution-preview">${level().solution.map(command => typeof command === 'string' ? DIRECTIONS[command].symbol : `↻ ${command.count} × [ ${command.body.map(dir => DIRECTIONS[dir].symbol).join(' ')} ]`).join(' &nbsp; ')}</strong><span class="small-note">Это один из возможных маршрутов. Загрузи его и посмотри, как он работает.</span><button class="primary-button wide-button" id="load-solution">Загрузить в редактор <span aria-hidden="true">→</span></button>`;
  $('#solution-button').hidden = true;
  $('#load-solution').addEventListener('click', () => {
    entry().program = clone(level().solution);
    selected = null;
    onEdit();
    feedback('', 'Решение в редакторе', 'Нажми «Запустить» и проследи за каждой командой. Этот уровень будет отмечен как пройденный с помощью решения.');
    $('#run-button').focus({ preventScroll: true });
  });
}

function openLoop(index = null) {
  if (running || !level().requiresLoop) return;
  loopEditIndex = index;
  loopDraft = index === null ? { count: 2, body: [] } : clone(program()[index]);
  renderLoop();
  $('#loop-dialog').showModal();
}

function renderLoop() {
  $('#repeat-options').innerHTML = [2,3,4].map(n => `<button class="repeat-option ${loopDraft.count === n ? 'chosen' : ''}" data-repeat="${n}" aria-label="Повторить ${n} раза" aria-pressed="${loopDraft.count === n}">${n}</button>`).join('');
  $('#loop-body').innerHTML = loopDraft.body.length ? loopDraft.body.map((dir, i) => `<button class="loop-token" data-remove-inner="${i}" aria-label="Удалить из цикла: ${DIRECTIONS[dir].label}, позиция ${i+1}"><span class="arrow" aria-hidden="true">${DIRECTIONS[dir].symbol}</span><span class="remove-mark" aria-hidden="true">×</span></button>`).join('') : '<span class="loop-empty">Добавь стрелки внутрь цикла ↓</span>';
  $('#loop-palette').querySelectorAll('button').forEach(button => button.disabled = loopDraft.body.length >= 8);
  $('#loop-summary').textContent = loopDraft.body.length ? `${loopDraft.body.length} команд внутри × ${loopDraft.count} повтора = ${loopDraft.body.length * loopDraft.count} шагов. Нажми на стрелку в цикле, чтобы удалить её.` : 'Добавь хотя бы одну команду внутрь цикла. Максимум — 8.';
  $('#save-loop').disabled = !loopDraft.body.length;
  $('#save-loop').innerHTML = `${loopEditIndex === null ? 'Добавить цикл' : 'Сохранить изменения'} <span aria-hidden="true">→</span>`;
}

function saveLoop() {
  if (!loopDraft.body.length) return;
  const command = { type: 'repeat', count: loopDraft.count, body: [...loopDraft.body] };
  const candidate = clone(program());
  if (loopEditIndex !== null) candidate[loopEditIndex] = command;
  else candidate.splice(selected === null ? candidate.length : selected+1, 0, command);
  if (expandProgram(candidate).error) { $('#loop-summary').textContent = 'С этим циклом получится больше 80 шагов или 24 блоков. Уменьши программу.'; return; }
  if (loopEditIndex !== null) { entry().program = candidate; selected = loopEditIndex; onEdit(); }
  else insertCommand(command);
  $('#loop-dialog').close();
  $('#loop-button').focus({ preventScroll: true });
}

function showResults() {
  stopRun(false);
  const completed = countCompleted();
  const independent = Object.values(state.levels).filter(item => item.independent).length;
  $('#results-content').innerHTML = `<img class="results-robot" src="./assets/robot.svg" alt="Роби"><h2>${completed === 8 ? 'Ты управляешь алгоритмами!' : 'Каждый шаг считается'}</h2><p class="results-intro">${completed === 8 ? 'Вся экспедиция пройдена. Ты познакомился с последовательностями, отладкой и циклами.' : 'Продолжай в своём темпе. Можно вернуться к любому уровню и попробовать другой маршрут.'}</p><div class="result-stats"><div class="result-stat"><b>${completed}<span style="display:inline;font-size:15px"> / 8</span></b><span>уровней пройдено</span></div><div class="result-stat"><b>${independent}</b><span>без подсказок</span></div><div class="result-stat"><b>${completed-independent}</b><span>с помощью</span></div></div><div class="result-levels">${LEVELS.map(item => { const saved = state.levels[item.id]; return `<div class="result-row"><span class="result-level-num">${saved.completed ? '✓' : String(item.id).padStart(2,'0')}</span><span>${escape(item.title)}</span><span class="result-label ${saved.completed ? 'done' : ''}">${!saved.completed ? 'Ещё впереди' : saved.independent ? 'Самостоятельно' : saved.solutionUsed ? 'С решением' : 'С подсказкой'}</span></div>`; }).join('')}</div><button class="primary-button wide-button" id="continue-results">${completed === 8 ? 'Ещё одна экспедиция' : 'Продолжить маршрут'} <span aria-hidden="true">→</span></button><p class="small-note">Результаты хранятся только в этом браузере. Помощь — часть обучения, за неё нет штрафов.</p><button class="reset-link" id="reset-progress">Сбросить весь прогресс</button><div id="reset-confirm" class="reset-confirm" hidden>Удалить сохранённые программы и результаты всех уровней?<div><button id="confirm-reset">Да, начать заново</button><button id="cancel-reset">Отмена</button></div></div>`;
  $('#continue-results').addEventListener('click', () => {
    $('#results-dialog').close();
    const target = LEVELS.find(item => !state.levels[item.id].completed) || LEVELS.find(item => !state.levels[item.id].independent) || LEVELS[0];
    switchLevel(target.id);
  });
  $('#reset-progress').addEventListener('click', () => { $('#reset-confirm').hidden = false; $('#cancel-reset').focus(); });
  $('#cancel-reset').addEventListener('click', () => { $('#reset-confirm').hidden = true; $('#reset-progress').focus(); });
  $('#confirm-reset').addEventListener('click', () => { state = freshState(LEVELS); persist(); $('#results-dialog').close(); renderLevel(); });
  $('#results-dialog').showModal();
}

directionButtons('#direction-palette');
directionButtons('#loop-palette', true);
$('#level-list').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && !running) switchLevel(Number(button.dataset.level)); });
$('#prev-level').addEventListener('click', () => switchLevel(state.current - 1));
$('#next-level').addEventListener('click', () => switchLevel(state.current + 1));
$('#direction-palette').addEventListener('click', event => { const button = event.target.closest('[data-direction]'); if (button) insertCommand(button.dataset.direction); });
$('#program').addEventListener('click', event => {
  const command = event.target.closest('[data-index]');
  if (!command || running) return;
  const index = Number(command.dataset.index);
  selected = selected === index ? null : index;
  renderProgram();
  $(`[data-index="${index}"]`)?.focus({ preventScroll: true });
});
$('#selection-tools').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || selected === null || running) return;
  const action = button.dataset.action;
  if (action === 'edit-loop') { openLoop(selected); return; }
  if (action === 'delete') { program().splice(selected, 1); selected = null; }
  else {
    const other = selected + (action === 'earlier' ? -1 : 1);
    if (other < 0 || other >= program().length) return;
    [program()[selected], program()[other]] = [program()[other], program()[selected]];
    selected = other;
  }
  onEdit();
  if (selected !== null) $(`[data-index="${selected}"]`)?.focus({ preventScroll: true });
  else $('#direction-palette button').focus({ preventScroll: true });
});
$('#selection-tools').addEventListener('change', event => {
  if (running || selected === null || !event.target.matches('select')) return;
  if (Object.hasOwn(DIRECTIONS, event.target.value)) { program()[selected] = event.target.value; onEdit(); $('#selection-tools select')?.focus({ preventScroll: true }); }
});
$('#clear-program').addEventListener('click', () => { if (!running) { entry().program = []; selected = null; onEdit(); $('#direction-palette button').focus({ preventScroll: true }); } });
$('#run-button').addEventListener('click', run);
$('#hint-button').setAttribute('aria-controls', 'hint-panel');
$('#hint-button').setAttribute('aria-expanded', 'false');
$('#hint-button').addEventListener('click', showHint);
$('#solution-button').addEventListener('click', showSolution);
$('#loop-button').addEventListener('click', () => openLoop());
$('#repeat-options').addEventListener('click', event => { const button = event.target.closest('[data-repeat]'); if (button) { loopDraft.count = Number(button.dataset.repeat); renderLoop(); $(`[data-repeat="${loopDraft.count}"]`).focus(); } });
$('#loop-palette').addEventListener('click', event => { const button = event.target.closest('[data-direction]'); if (button && loopDraft.body.length < 8) { loopDraft.body.push(button.dataset.direction); renderLoop(); } });
$('#loop-body').addEventListener('click', event => { const button = event.target.closest('[data-remove-inner]'); if (button) { loopDraft.body.splice(Number(button.dataset.removeInner), 1); renderLoop(); $('#loop-palette button').focus({ preventScroll: true }); } });
$('#save-loop').addEventListener('click', saveLoop);
$('#help-button').addEventListener('click', () => { stopRun(false); $('#help-dialog').showModal(); });
$('#help-done').addEventListener('click', () => { $('#help-dialog').close(); $('#direction-palette button').focus({ preventScroll: true }); $('#program').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
$('#start-button').addEventListener('click', () => {
  $('#workspace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  $('#direction-palette button').focus({ preventScroll: true });
  feedback('', 'Начнём с простого', 'Нажимай на стрелки, чтобы собрать маршрут. Одна команда перемещает Роби на одну клетку.');
});
$('#progress-button').addEventListener('click', showResults);
$('#journey-count').addEventListener('click', showResults);
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('#storage-notice').hidden = storageOK;
renderLevel();
