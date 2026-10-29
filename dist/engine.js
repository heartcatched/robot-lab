import { DIRECTIONS, CONDITIONS, LIMITS, cellKey, sameCell, inBounds, canMove, validateProgram, validateScene } from './model.js';

export function evaluateCondition(condition, scene, position, painted) {
  if (condition === 'painted') return painted.has(cellKey(position));
  if (condition === 'clear') return !painted.has(cellKey(position));
  const [kind, direction] = condition.split(':');
  const free = canMove(scene, position, direction);
  return kind === 'free' ? free : !free;
}
export function checkObjective(scene, position, painted) {
  if (scene.goal && !sameCell(position, scene.goal)) return { status: 'unfinished', message: 'Программа закончилась, но Роби ещё не на станции. Исправь маршрут или добавь команды.' };
  if (scene.targets !== null) {
    const expected = new Set([...scene.initialPaint, ...scene.targets].map(cellKey));
    const missing = [...expected].filter(k => !painted.has(k));
    const extra = [...painted].filter(k => !expected.has(k));
    if (missing.length || extra.length) return { status: 'paint', missing, extra, message: `Проверь рисунок: осталось закрасить ${missing.length}, лишних закрашенных клеток — ${extra.length}.` };
  }
  return { status: scene.goal || scene.targets !== null ? 'success' : 'finished', message: 'Программа выполнена.' };
}
class Halt extends Error { constructor(status, message) { super(message); this.status = status; } }

// Auto-run, single-step and grading consume this same generator.
export function* execute(scene, program, rules = {}) {
  let position = [...scene.start], painted = new Set(scene.initialPaint.map(cellKey));
  let operations = 0, activeId = null, blocked=null;
  const used = new Set(), calls = {};
  const snapshot = () => ({ position: [...position], painted: [...painted], operations });
  function guard() {
    if (operations >= LIMITS.operations) throw new Halt('limit', 'Выполнено 1000 операций. Возможно, условие цикла никогда не меняется. Проверь «Пока» и команды внутри него.');
  }
  function event(n, kind, detail, extra = {}) {
    activeId = n.id;
    guard(); operations++;
    used.add(n.type);
    return { nodeId: n.id, kind, detail, ...snapshot(), ...extra };
  }
  function* run(list, scope = 'main') {
    for (const n of list) {
      activeId = n.id;
      guard();
      if (n.type === 'move') {
        const d = DIRECTIONS[n.direction], next = [position[0]+d.dr,position[1]+d.dc];
        if (!canMove(scene, position, n.direction)) {
          blocked={from:[...position],next,direction:n.direction};
          const status = inBounds(scene,next) ? 'wall' : 'boundary';
          const message = status === 'wall' ? 'На пути преграда. Проверь эту команду или условие перед движением.' : 'Роби дошёл до края поля. Выбери другое направление или проверь свободный путь.';
          yield event(n, 'error', message, { error: status, scope });
          throw new Halt(status, message);
        }
        position = next;
        yield event(n, 'move', `Шаг: ${d.label.toLowerCase()}`, { scope });
      } else if (n.type === 'paint') {
        painted.add(cellKey(position));
        yield event(n, 'paint', 'Текущая клетка закрашена', { scope });
      } else if (n.type === 'if') {
        const truth = evaluateCondition(n.condition,scene,position,painted);
        yield event(n, 'condition', `${CONDITIONS[n.condition]}: ${truth ? 'да' : 'нет'}`, { truth, scope });
        yield* run(truth ? n.then : n.else, scope);
      } else if (n.type === 'repeat') {
        for (let i=1; i<=n.count; i++) {
          yield event(n, 'repeat', `Повтор ${i} из ${n.count}`, { iteration: i, scope });
          yield* run(n.body, scope);
        }
      } else if (n.type === 'while') {
        while (true) {
          const truth = evaluateCondition(n.condition,scene,position,painted);
          yield event(n, 'condition', `Пока ${CONDITIONS[n.condition]}: ${truth ? 'да — продолжаем' : 'нет — выходим из цикла'}`, { truth, scope });
          if (!truth) break;
          yield* run(n.body, scope);
        }
      } else if (n.type === 'call') {
        calls[n.name] = (calls[n.name] || 0) + 1;
        yield event(n, 'call', `Вызов алгоритма ${n.name}`, { scope });
        yield* run(program.procedures[n.name], n.name);
        yield event(n, 'return', `Вернулись из алгоритма ${n.name}`, { scope });
      }
    }
  }
  let result;
  try {
    const field = validateScene(scene), valid = validateProgram(program,{ allowed: rules.allowed });
    if (!field.ok || !valid.ok) throw new Halt('invalid', field.message || valid.message);
    yield* run(program.main);
    result = checkObjective(scene,position,painted);
    if (['success','finished'].includes(result.status)) {
      const absent = (rules.required || []).filter(type => !used.has(type));
      if (absent.length || (rules.minCalls && Object.values(calls).reduce((a,b)=>a+b,0) < rules.minCalls) || (rules.requiredCalls || []).some(name => !calls[name])) result = { status: 'needs-construct', message: 'Поле решено, но учебная задача ещё не завершена. Используй конструкции, указанные в цели уровня.' };
    }
  } catch (error) { result = { status: error.status || 'invalid', message: error.message, nodeId: activeId, ...(blocked?{blocked}:{}) }; }
  yield { kind: 'finish', result: { ...result, ...snapshot(), used: [...used], calls } };
}
export function simulate(scene, program, rules = {}) {
  const frames = []; let result;
  for (const frame of execute(scene,program,rules)) {
    if (frame.kind === 'finish') result = frame.result;
    else frames.push(frame);
  }
  return { ...result, frames };
}
export function verifyLevel(level, program) {
  const results = level.scenes.map(scene => simulate(scene,program,level));
  return { success: results.every(r => r.status === 'success'), results };
}
