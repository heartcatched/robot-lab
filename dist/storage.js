import { clone, emptyProgram, migrateProgram, validateProgram } from './model.js';
export const STORAGE_KEY = 'robokhod-progress-v2';
export const LEGACY_KEY = 'robokhod-progress-v1';
export const SANDBOX_KEY = 'robokhod-sandbox-v1';
export function freshState(levels) {
  return { version: 2, current: levels[0].id, levels: Object.fromEntries(levels.map(level => [level.id, {
    program: clone(level.initial || emptyProgram()), hintUsed: false, solutionUsed: false, completed: false, independent: false, attempts: 0,
  }])) };
}
export function loadState(storage, levels) {
  const state = freshState(levels);
  try {
    const current = storage.getItem(STORAGE_KEY);
    const raw = current || storage.getItem(LEGACY_KEY);
    if (!raw) return { state, storageOK: true, migrated: false };
    const saved = JSON.parse(raw);
    if (![1,2].includes(saved?.version) || !saved.levels || typeof saved.levels !== 'object') return { state, storageOK: true, migrated: false };
    if (levels.some(l => l.id === saved.current)) state.current = saved.current;
    for (const level of levels) {
      const old = saved.levels[level.id];
      if (!old || typeof old !== 'object') continue;
      let p; try { p = migrateProgram(old.program); } catch { continue; }
      if (!validateProgram(p, { draft: true }).ok) continue;
      state.levels[level.id] = {
        program: p, hintUsed: old.hintUsed === true, solutionUsed: old.solutionUsed === true,
        completed: old.completed === true, independent: old.completed === true && old.independent === true,
        attempts: Number.isSafeInteger(old.attempts) && old.attempts >= 0 ? old.attempts : 0,
      };
    }
    // A successful write creates v2; the original v1 key remains a backup.
    const migrated = saved.version === 1;
    if (migrated) storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { state, storageOK: true, migrated };
  } catch { return { state, storageOK: false, migrated: false }; }
}
