import { DIRECTIONS, makeScene, migrateProgram, emptyProgram, programOf, move, paint, repeat as loop, when, until, call } from './model.js';
export { DIRECTIONS };
const repeat = (count, ...body) => ({ type: 'repeat', count, body });
const corridorWalls = (path) => Array.from({ length: 25 }, (_, i) => [Math.floor(i / 5), i % 5]).filter(([r, c]) => !path.some(([pr, pc]) => pr === r && pc === c));
const stairs = [[4,0],[3,0],[3,1],[2,1],[2,2],[1,2],[1,3]];

const BASE_LEVELS = [
  {
    id: 1, title: 'Первый запуск', concept: 'Последовательность', group: 'Первые шаги',
    description: 'Роби пора подзарядиться. Составь программу и доведи его до станции.',
    start: [4, 0], goal: [4, 3], walls: [], initial: [],
    hint: 'Одна стрелка — один шаг. Станция на три клетки правее Роби: добавь три команды «Вправо».',
    solution: ['right', 'right', 'right'],
    takeaway: 'Алгоритм — это последовательность точных команд. Роби выполнил их по порядку и добрался до станции.',
  },
  {
    id: 2, title: 'Меняем направление', concept: 'Порядок команд', group: 'Первые шаги',
    description: 'Теперь станция выше. Соедини в программе движения в разных направлениях.',
    start: [4, 0], goal: [2, 2], walls: [], initial: [],
    hint: 'Станция на две клетки правее и на две выше. Попробуй сначала пройти вправо, а затем вверх.',
    solution: ['right', 'right', 'up', 'up'],
    takeaway: 'Разные последовательности иногда приводят в одну точку. Здесь можно было сначала пойти вверх, а потом вправо.',
  },
  {
    id: 3, title: 'Есть обходной путь', concept: 'Планирование', group: 'Первые шаги',
    description: 'Прямой путь перекрыт. Продумай маршрут вокруг каменных блоков.',
    start: [4, 0], goal: [4, 4], walls: [[3,2],[4,2]], initial: [],
    hint: 'Поднимись на две клетки, пройди над препятствиями вправо, затем спустись к станции.',
    solution: ['up', 'up', 'right', 'right', 'right', 'right', 'down', 'down'],
    takeaway: 'До запуска полезно проверить весь маршрут. Кратчайший путь по прямой не всегда доступен.',
  },
  {
    id: 4, title: 'Дело в одной команде', concept: 'Отладка', group: 'Учимся исправлять',
    description: 'В программе уже есть ошибка. Запусти её, найди неверную команду и замени.',
    start: [4, 0], goal: [2, 3], walls: [[4,2],[3,3]],
    initial: ['right', 'up', 'right', 'down', 'right'],
    hint: 'Четвёртая команда ведёт в препятствие. Выбери её и замени «Вниз» на «Вверх».',
    solution: ['right', 'up', 'right', 'up', 'right'],
    takeaway: 'Ты выполнил отладку: нашёл место ошибки и исправил программу. Ошибка — полезная подсказка о том, что изменить.',
  },
  {
    id: 5, title: 'Меньше повторов', concept: 'Первый цикл', group: 'Сила циклов', requiresLoop: true,
    description: 'Четыре одинаковых шага? Пусть цикл повторит команду за тебя.',
    start: [4, 0], goal: [4, 4], walls: [], initial: [],
    hint: 'Нажми «Повторить», выбери 4 раза и добавь внутрь одну команду «Вправо». Запусти программу.',
    solution: [repeat(4, 'right')],
    takeaway: 'Цикл повторяет команды заданное число раз. Одна команда «Вправо» внутри цикла выполнилась четыре раза.',
  },
  {
    id: 6, title: 'Шаг за шагом', concept: 'Команды внутри цикла', group: 'Сила циклов', requiresLoop: true,
    description: 'Заметь повторяющийся рисунок лестницы. Запиши его с помощью цикла.',
    start: [4, 0], goal: [1, 3], walls: corridorWalls(stairs), initial: [],
    hint: 'Одна ступенька — «Вверх», затем «Вправо». Таких ступенек три. Повтори эту пару команд 3 раза.',
    solution: [repeat(3, 'up', 'right')],
    takeaway: 'Внутри цикла может быть несколько команд. Сначала выполняется вся пара, затем начинается следующий повтор.',
  },
  {
    id: 7, title: 'Ещё один шаг', concept: 'Команды после цикла', group: 'Сила циклов', requiresLoop: true,
    description: 'За знакомой лестницей остался один шаг. Совмести цикл и обычную команду.',
    start: [4, 0], goal: [0, 3], walls: corridorWalls([...stairs, [0,3]]), initial: [],
    hint: 'Повтори «Вверх → Вправо» 3 раза. После цикла добавь отдельную команду «Вверх».',
    solution: [repeat(3, 'up', 'right'), 'up'],
    takeaway: 'После последнего повтора программа продолжается. Отдельная команда вне цикла выполняется только один раз.',
  },
  {
    id: 8, title: 'Ты за программиста', concept: 'Самостоятельная миссия', group: 'Сила циклов', requiresLoop: true,
    description: 'Новый маршрут, знакомые инструменты. Доведи Роби до станции, используя цикл.',
    start: [4, 0], goal: [0, 4],
    walls: corridorWalls([[4,0],[3,0],[2,0],[2,1],[2,2],[1,2],[0,2],[0,3],[0,4]]), initial: [],
    hint: 'Найди большой повторяющийся фрагмент: два шага вверх и два вправо. Сколько раз он встречается?',
    solution: [repeat(2, 'up', 'up', 'right', 'right')],
    takeaway: 'Ты соединил планирование, последовательности и циклы. Именно так большие задачи разбивают на понятные повторяющиеся действия.',
  },
];

export const LEVELS = BASE_LEVELS.map(level => ({
  ...level, chapter: level.id <= 4 ? 'Основы' : 'Циклы',
  scenes: [makeScene({ start: level.start, goal: level.goal, blocks: level.walls })],
  initial: migrateProgram(level.initial), solution: migrateProgram(level.solution),
  allowed: level.id <= 4 ? ['move'] : ['move', 'repeat'],
  required: level.requiresLoop ? ['repeat'] : [],
}));

const R = () => move('right'), U = () => move('up'), D = () => move('down'), L = () => move('left');
const row = (r, length) => Array.from({length}, (_, c) => [r,c]);
// A thin wall ends each corridor. Other cells remain open for experimentation.
const corridor = (length, extra = {}) => makeScene({
  rows: 7, cols: 7, start: [6,0], goal: [6,length-1],
  edges: length < 7 ? [[6,length-1,'right']] : [], ...extra,
});
const upperWalls = (length, cells) => corridor(length, {
  edges: [...(length<7 ? [[6,length-1,'right']] : []), ...cells.map(c=>[6,c,'up'])],
  targets: cells.map(c=>[6,c]),
});
const advanced = [
  {
    id: 9, title: 'Оставь свой след', chapter: 'Рисуем', concept: 'Закрашивание',
    description: 'Закрась отмеченную пунктиром клетку и доберись до станции. Другие клетки оставь чистыми.',
    scenes: [makeScene({start:[4,0],goal:[4,3],targets:[[4,1]]})],
    solution: programOf([R(),paint(),R(),R()]), required:['paint'],
    hint: 'Сначала шаг вправо на отмеченную клетку, затем «Закрасить». После этого до станции ещё два шага.',
    takeaway: 'Команда «Закрасить» меняет текущую клетку. Она не передвигает Роби.',
  },
  {
    id: 10, title: 'Пунктирная дорожка', chapter: 'Рисуем', concept: 'Закраска в цикле',
    description: 'Нарисуй дорожку через одну клетку. Используй «Повторить» и закончи на станции.',
    scenes: [makeScene({rows:7,cols:7,start:[6,0],goal:[6,6],targets:[[6,0],[6,2],[6,4]]})],
    solution: programOf([loop(3,[paint(),R(),R()])]), required:['paint','repeat'],
    hint: 'Один фрагмент: закрасить, вправо, вправо. Повтори его три раза. Саму станцию красить не нужно.',
    takeaway: 'Цикл повторяет целый фрагмент рисунка — вместе с движениями и закраской.',
  },
  {
    id: 11, title: 'Сначала проверь', chapter: 'Условия', concept: 'Если',
    description: 'Если справа свободно, сделай шаг вправо. Иначе останься на месте. Одна программа должна пройти три поля.',
    scenes: [makeScene({start:[4,1],goal:[4,2]}),makeScene({start:[4,1],goal:[4,1],edges:[[4,1,'right']]}),makeScene({start:[2,2],goal:[2,3]})],
    solution: programOf([when('free:right',[R()])]), required:['if'],
    hint: 'Добавь «Если», выбери «справа свободно». В ветке «То» — шаг вправо, ветку «Иначе» оставь пустой.',
    takeaway: 'Условие проверяется в момент выполнения. Если оно ложно, пустая ветка ничего не делает.',
  },
  {
    id: 12, title: 'Два пути', chapter: 'Условия', concept: 'Если — иначе',
    description: 'Проверь путь сверху: если свободно — иди вверх, иначе — вправо. Используй обе ветки условия.',
    scenes: [makeScene({start:[3,1],goal:[2,1]}),makeScene({start:[3,1],goal:[3,2],edges:[[3,1,'up']]}),makeScene({start:[0,2],goal:[0,3]})],
    solution: programOf([when('free:up',[U()],[R()])]), required:['if'],
    hint: 'В «Если» выбери «сверху свободно». Внутри «То» добавь «Вверх», внутри «Иначе» — «Вправо».',
    takeaway: 'Выполняется только одна из двух веток. Край поля тоже считается стеной.',
  },
  {
    id: 13, title: 'До самой стены', chapter: 'Пока', concept: 'Цикл с условием',
    description: 'Дойди вправо до стены. Длина дорожки меняется: используй цикл «Пока».',
    scenes: [3,5,7].map(n=>corridor(n)),
    solution: programOf([until('free:right',[R()])]), required:['while'],
    hint: '«Пока справа свободно» → «Вправо». Перед каждым новым шагом Роби проверит условие.',
    takeaway: '«Пока» подходит, когда число повторений заранее неизвестно. Условие проверяется до действия.',
  },
  {
    id: 14, title: 'Малярная бригада', chapter: 'Пока', concept: 'Закраска до стены',
    description: 'Закрась всю дорожку до станции с помощью «Пока». Не забудь клетку, на которой Роби начинает.',
    scenes: [3,5,7].map(n=>corridor(n,{targets:row(6,n)})),
    solution: programOf([paint(),until('free:right',[R(),paint()])]), required:['while','paint'],
    hint: 'Закрась старт до цикла. В цикле «Пока справа свободно» сделай шаг вправо и закрась новую клетку.',
    takeaway: 'Действие до цикла помогает обработать стартовую клетку. Внутри цикла сначала двигаемся, потом красим.',
  },
  {
    id: 15, title: 'По приметам', chapter: 'Пока', concept: 'Условие внутри цикла',
    description: 'Иди вправо до стены и крась только клетки со стеной сверху. Используй «Если» внутри «Пока».',
    scenes: [upperWalls(5,[0,2,4]),upperWalls(7,[1,3,5]),upperWalls(4,[0,1,3])],
    solution: programOf([until('free:right',[when('wall:up',[paint()]),R()]),when('wall:up',[paint()])]), required:['while','if','paint'],
    hint: 'В «Пока справа свободно»: если сверху стена — закрась, затем шаг вправо. После цикла проверь последнюю клетку отдельно.',
    takeaway: 'Условие внутри цикла принимаeт решение на каждой клетке. После выхода из цикла последняя клетка тоже требует проверки.',
  },
  {
    id: 16, title: 'Найди проход', chapter: 'Пока', concept: 'Пока есть стена',
    description: 'Поднимайся вдоль стены справа до первого прохода, затем шагни вправо на станцию. На одном поле проход уже рядом.',
    scenes: [2,0,4].map(gap=>makeScene({start:[4,1],goal:[gap,2],edges:Array.from({length:4-gap},(_,i)=>[4-i,1,'right'])})),
    solution: programOf([until('wall:right',[U()]),R()]), required:['while'],
    hint: '«Пока справа стена» → «Вверх». Шаг вправо добавь в основную программу после цикла.',
    takeaway: 'Цикл может выполниться ноль раз: если проход уже рядом, его тело сразу пропускается.',
  },
  {
    id: 17, title: 'Команда твоего имени', chapter: 'Алгоритмы', concept: 'Вспомогательный алгоритм',
    description: 'Создай алгоритм А: закрасить клетку и шагнуть вправо. Вызови его дважды, с одним шагом вправо между вызовами.',
    scenes:[makeScene({start:[4,0],goal:[4,3],targets:[[4,0],[4,2]]})],
    solution:programOf([call('А'),R(),call('А')],{А:[paint(),R()]}),required:['call','paint'],minCalls:2,
    hint:'Открой вкладку «А» и добавь «Закрасить → Вправо». Во вкладке «Основная»: «Вызвать А → Вправо → Вызвать А».',
    takeaway:'Алгоритм — именованная группа команд. После вызова Роби возвращается к следующей команде основной программы.',
  },
  {
    id: 18, title: 'Фабрика узоров', chapter: 'Алгоритмы', concept: 'Вызов внутри цикла',
    description:'Закрась три столбика по две клетки. Вынеси один столбик в алгоритм А и вызывай его из цикла «Повторить».',
    scenes:[makeScene({start:[4,0],goal:[4,3],targets:[...row(4,3),...row(3,3)]})],
    solution:programOf([loop(3,[call('А')])],{А:[paint(),U(),paint(),R(),D()]}),required:['repeat','call','paint'],
    hint:'Алгоритм А: закрасить, вверх, закрасить, вправо, вниз. В основной программе повтори вызов А три раза.',
    takeaway:'Цикл отвечает за количество повторений, а вспомогательный алгоритм — за рисунок одного фрагмента.',
  },
  {
    id: 19, title: 'Раздели работу', chapter: 'Алгоритмы', concept: 'Два алгоритма',
    description:'Закрась три нижних ряда. Алгоритм А красит ряд вправо, алгоритм Б возвращается влево и поднимается. Используй оба.',
    scenes:[makeScene({start:[4,0],goal:[2,4],targets:[...row(4,5),...row(3,5),...row(2,5)]})],
    solution:programOf([loop(2,[call('А'),call('Б')]),call('А')],{А:[paint(),until('free:right',[R(),paint()])],Б:[until('free:left',[L()]),U()]}),
    required:['call','while','paint'],requiredCalls:['А','Б'],
    hint:'А: закрасить старт, затем пока справа свободно — вправо и закрасить. Б: пока слева свободно — влево; потом вверх. Основная: дважды А, Б; затем ещё А.',
    takeaway:'Большую задачу удобно делить на действия с понятной ролью. Один и тот же алгоритм работает в разных рядах.',
  },
  {
    id: 20, title: 'Один код — три мира', chapter: 'Алгоритмы', concept: 'Финальная миссия',
    description:'Пройди вправо до станции и закрась только клетки со стеной сверху. Пусть алгоритм А проверяет и красит, а «Пока» управляет движением.',
    scenes:[upperWalls(3,[0,2]),upperWalls(5,[1,2,4]),upperWalls(7,[0,2,5])],
    solution:programOf([call('А'),until('free:right',[R(),call('А')])],{А:[when('wall:up',[paint()])]}),
    required:['while','if','call','paint'],requiredCalls:['А'],
    hint:'Алгоритм А: если сверху стена — закрасить. Основная: вызвать А на старте, затем пока справа свободно — вправо и снова А.',
    takeaway:'Ты написал программу для разных полей: она смотрит на обстановку и принимает решения, а не запоминает один маршрут.',
  },
];
for (const level of advanced) LEVELS.push({
  initial:emptyProgram(), ...level,
  allowed:['move','repeat','paint',...(level.id>=11?['if']:[]),...(level.id>=13?['while']:[]),...(level.id>=17?['call']:[])],
});
export const CHAPTERS = [...new Set(LEVELS.map(l=>l.chapter))];
