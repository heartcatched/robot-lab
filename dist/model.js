export const DIRECTIONS = {
  up: { label: 'Вверх', symbol: '↑', dr: -1, dc: 0, sensor: 'сверху' },
  right: { label: 'Вправо', symbol: '→', dr: 0, dc: 1, sensor: 'справа' },
  down: { label: 'Вниз', symbol: '↓', dr: 1, dc: 0, sensor: 'снизу' },
  left: { label: 'Влево', symbol: '←', dr: 0, dc: -1, sensor: 'слева' },
};
export const PROCEDURES = ['А', 'Б', 'В'];
export const LIMITS = { blocks: 80, depth: 3, operations: 1000, bytes: 131072 };
export const CONDITIONS = Object.fromEntries([
  ...Object.entries(DIRECTIONS).flatMap(([dir, d]) => [[`free:${dir}`, `${d.sensor} свободно`], [`wall:${dir}`, `${d.sensor} стена`]]),
  ['clear', 'клетка чистая'], ['painted', 'клетка закрашена'],
]);
export const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
export const uid = () => `n${Date.now().toString(36)}_${(++serial).toString(36)}`;
export const node = (type, extra = {}) => ({ id: uid(), type, ...extra });
export const move = direction => node('move', { direction });
export const paint = () => node('paint');
export const repeat = (count, body) => node('repeat', { count, body });
export const when = (condition, then, otherwise = []) => node('if', { condition, then, else: otherwise });
export const until = (condition, body) => node('while', { condition, body });
export const call = name => node('call', { name });
export const emptyProgram = () => ({ main: [], procedures: { А: [], Б: [], В: [] } });
export const programOf = (main, procedures = {}) => ({ ...emptyProgram(), main, procedures: { А: [], Б: [], В: [], ...procedures } });

export function migrateProgram(value) {
  if (!Array.isArray(value)) return clone(value);
  const convert = commands => commands.map(command => typeof command === 'string'
    ? move(command) : repeat(command.count, convert(command.body)));
  return programOf(convert(value));
}

export function walkProgram(program, visit) {
  function walk(list, depth, scope) {
    if (!Array.isArray(list)) return;
    list.forEach((n, index) => {
      visit(n, { list, index, depth, scope });
      if (n?.type === 'if') { walk(n.then, depth + 1, scope); walk(n.else, depth + 1, scope); }
      if (n?.type === 'repeat' || n?.type === 'while') walk(n.body, depth + 1, scope);
    });
  }
  walk(program?.main, 0, 'main');
  for (const name of PROCEDURES) walk(program?.procedures?.[name], 0, name);
}

export function validateProgram(program, { draft = false, allowed = null } = {}) {
  try {
    if (!program || typeof program !== 'object' || !Array.isArray(program.main) || !program.procedures) throw Error('Неверный формат программы.');
    if (!draft && !program.main.length) throw Error('Добавь хотя бы одну команду в основную программу.');
    let count = 0;
    const ids = new Set(), graph = { main: [], А: [], Б: [], В: [] };
    function validate(list, depth, scope) {
      if (!Array.isArray(list)) throw Error('В блоке отсутствует список команд.');
      for (const n of list) {
        if (++count > LIMITS.blocks) throw Error(`В программе может быть не больше ${LIMITS.blocks} блоков.`);
        if (!n || typeof n !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id) || ids.has(n.id)) throw Error('Неверный или повторяющийся идентификатор блока.');
        ids.add(n.id);
        if (allowed && !allowed.includes(n.type)) throw Error('Эта команда ещё не используется на данном уровне.');
        if (n.type === 'move') { if (!Object.hasOwn(DIRECTIONS, n.direction)) throw Error('Выбери направление движения.'); }
        else if (n.type === 'paint') { /* no parameters */ }
        else if (n.type === 'call') {
          if (!PROCEDURES.includes(n.name)) throw Error('Выбери алгоритм А, Б или В.');
          graph[scope].push(n.name);
        } else if (['repeat', 'if', 'while'].includes(n.type)) {
          if (depth >= LIMITS.depth) throw Error('Допускается до трёх уровней вложенности.');
          if (n.type === 'repeat' && (!Number.isInteger(n.count) || n.count < 1 || n.count > 10)) throw Error('Число повторений должно быть от 1 до 10.');
          if (n.type !== 'repeat' && !Object.hasOwn(CONDITIONS, n.condition)) throw Error('Выбери условие.');
          const body = n.type === 'if' ? n.then : n.body;
          if (!Array.isArray(body) || (!draft && !body.length)) throw Error(`Добавь команды внутрь блока «${n.type === 'if' ? 'Если' : n.type === 'while' ? 'Пока' : 'Повторить'}».`);
          validate(body, depth + 1, scope);
          if (n.type === 'if') validate(n.else, depth + 1, scope);
        } else throw Error('Неизвестная команда.');
      }
    }
    validate(program.main, 0, 'main');
    for (const name of PROCEDURES) validate(program.procedures[name], 0, name);
    function checkCalls(name, stack = []) {
      if (stack.includes(name)) throw Error('Алгоритм не может вызывать сам себя — даже через другой алгоритм.');
      for (const target of graph[name]) {
        if (!draft && !program.procedures[target].length) throw Error(`Алгоритм ${target} пуст. Добавь в него команды.`);
        checkCalls(target, [...stack, name]);
      }
    }
    for (const name of ['main', ...PROCEDURES]) checkCalls(name);
    return { ok: true, count };
  } catch (error) { return { ok: false, message: error.message }; }
}

export const cellKey = cell => cell.join(',');
export const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const inBounds = (scene, [r, c]) => r >= 0 && c >= 0 && r < scene.rows && c < scene.cols;
export function edgeKey(a, b) { return [cellKey(a), cellKey(b)].sort().join('|'); }
export function edgeCells([r, c, direction]) { const d = DIRECTIONS[direction]; return [[r, c], [r + d.dr, c + d.dc]]; }
export function makeScene({ rows = 5, cols = 5, start = [rows-1, 0], goal = null, blocks = [], edges = [], initialPaint = [], targets = null } = {}) {
  return clone({ rows, cols, start, goal, blocks, edges, initialPaint, targets });
}
export function validateScene(scene) {
  try {
    if (!scene || !Number.isInteger(scene.rows) || !Number.isInteger(scene.cols) || scene.rows < 5 || scene.rows > 8 || scene.cols < 5 || scene.cols > 8) throw Error('Размер поля должен быть от 5 × 5 до 8 × 8.');
    const position = p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && inBounds(scene, p);
    if (!position(scene.start) || (scene.goal !== null && !position(scene.goal))) throw Error('Роби или станция находятся за пределами поля.');
    for (const key of ['blocks','initialPaint', 'targets']) {
      if (key === 'targets' && scene[key] === null) continue;
      if (!Array.isArray(scene[key]) || scene[key].length > 64 || !scene[key].every(position)) throw Error('Некорректный список клеток.');
      if (new Set(scene[key].map(cellKey)).size !== scene[key].length) throw Error('В списке клеток есть повторы.');
    }
    if (!Array.isArray(scene.edges) || scene.edges.length > 112) throw Error('Неверный список стен.');
    const seen = new Set();
    for (const edge of scene.edges) {
      if (!Array.isArray(edge) || edge.length !== 3 || !Object.hasOwn(DIRECTIONS, edge[2]) || !edgeCells(edge).every(position)) throw Error('Стены должны находиться между клетками поля.');
      const key = edgeKey(...edgeCells(edge));
      if (seen.has(key)) throw Error('Одна стена указана дважды.'); seen.add(key);
    }
    const blocks = new Set(scene.blocks.map(cellKey));
    if ([scene.start, ...(scene.goal ? [scene.goal] : []), ...scene.initialPaint, ...(scene.targets || [])].some(p => blocks.has(cellKey(p)))) throw Error('Камень не может занимать клетку Роби, станции или закраски.');
    return { ok: true };
  } catch (error) { return { ok: false, message: error.message }; }
}

export function canMove(scene, position, direction) {
  const d = DIRECTIONS[direction];
  const next = [position[0] + d.dr, position[1] + d.dc];
  return inBounds(scene, next) && !scene.blocks.some(p => sameCell(p, next)) && !scene.edges.some(edge => edgeKey(...edgeCells(edge)) === edgeKey(position, next));
}
