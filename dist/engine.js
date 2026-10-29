import { DIRECTIONS } from './levels.js';

export const MAX_BLOCKS = 24;
export const MAX_STEPS = 80;
export const STORAGE_KEY = 'robokhod-progress-v1';
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const isDirection = (value) => typeof value === 'string' && Object.hasOwn(DIRECTIONS, value);

export function validProgram(program) {
  return Array.isArray(program) && program.length <= MAX_BLOCKS && program.every(command =>
    isDirection(command) || (command && typeof command === 'object' && !Array.isArray(command) &&
      command.type === 'repeat' && Number.isInteger(command.count) && command.count >= 2 && command.count <= 4 &&
      Array.isArray(command.body) && command.body.length >= 1 && command.body.length <= 8 && command.body.every(isDirection)));
}

export function expandProgram(program) {
  if (!validProgram(program)) return { error: 'invalid', steps: [] };
  const steps = [];
  program.forEach((command, index) => {
    if (typeof command === 'string') steps.push({ direction: command, index, inner: null, iteration: null });
    else for (let iteration = 0; iteration < command.count; iteration++) {
      command.body.forEach((direction, inner) => steps.push({ direction, index, inner, iteration: iteration + 1 }));
    }
  });
  if (steps.length > MAX_STEPS) return { error: 'limit', steps: [] };
  return { steps };
}

export function simulate(level, program) {
  const { error, steps } = expandProgram(program);
  if (error) return { status: error, frames: [], position: [...level.start] };
  if (!steps.length) return { status: 'empty', frames: [], position: [...level.start] };
  let position = [...level.start];
  const frames = [];
  for (const step of steps) {
    const { dr, dc } = DIRECTIONS[step.direction];
    const next = [position[0] + dr, position[1] + dc];
    const failure = next.some(n => n < 0 || n >= 5) ? 'boundary'
      : level.walls.some(([r, c]) => r === next[0] && c === next[1]) ? 'wall' : null;
    frames.push({ ...step, position: failure ? [...position] : next, failure, number: frames.length + 1 });
    if (failure) return { status: failure, frames, position };
    position = next;
  }
  const atGoal = position[0] === level.goal[0] && position[1] === level.goal[1];
  const loopUsed = program.some(command => typeof command === 'object');
  return { status: !atGoal ? 'unfinished' : level.requiresLoop && !loopUsed ? 'needs-loop' : 'success', frames, position };
}

export function freshState(levels) {
  return { version: 1, current: 1, levels: Object.fromEntries(levels.map(level => [level.id, {
    program: clone(level.initial), hintUsed: false, solutionUsed: false, completed: false, independent: false, attempts: 0,
  }])) };
}

export function loadState(storage, levels) {
  const fresh = freshState(levels);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { state: fresh, storageOK: true };
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || !saved.levels || typeof saved.levels !== 'object') return { state: fresh, storageOK: true };
    if (Number.isInteger(saved.current) && saved.current >= 1 && saved.current <= levels.length) fresh.current = saved.current;
    for (const level of levels) {
      const entry = saved.levels[level.id];
      if (!entry || !validProgram(entry.program) || expandProgram(entry.program).error) continue;
      if (!level.requiresLoop && entry.program.some(command => typeof command === 'object')) continue;
      fresh.levels[level.id] = {
        program: clone(entry.program), hintUsed: entry.hintUsed === true, solutionUsed: entry.solutionUsed === true,
        completed: entry.completed === true, independent: entry.completed === true && entry.independent === true,
        attempts: Number.isSafeInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0,
      };
    }
    return { state: fresh, storageOK: true };
  } catch { return { state: fresh, storageOK: false }; }
}
