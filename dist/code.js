import { DIRECTIONS, CONDITIONS, PROCEDURES } from './model.js';
export function generateCode(program) {
  const lines = [], mapping = {};
  const add = (text, id = null) => { const line = lines.length; lines.push({text,id}); if (id && mapping[id] === undefined) mapping[id] = line; };
  function body(list, depth = 1) {
    const prefix = '  '.repeat(depth);
    if (!list.length) add(prefix + '| Добавь команды');
    for (const n of list) {
      if (n.type === 'move') add(prefix+DIRECTIONS[n.direction].label.toLowerCase(),n.id);
      else if (n.type === 'paint') add(prefix+'закрасить',n.id);
      else if (n.type === 'call') add(prefix+n.name,n.id);
      else if (n.type === 'repeat' || n.type === 'while') {
        add(prefix+(n.type==='repeat' ? `нц ${n.count} раз` : `нц пока ${CONDITIONS[n.condition]}`),n.id);
        body(n.body,depth+1); add(prefix+'кц');
      } else if (n.type === 'if') {
        add(prefix+`если ${CONDITIONS[n.condition]}`,n.id); add(prefix+'то'); body(n.then,depth+1);
        if(n.else.length){add(prefix+'иначе');body(n.else,depth+1);} add(prefix+'все');
      }
    }
  }
  add('использовать Робот'); add(''); add('алг'); add('нач'); body(program.main); add('кон');
  for(const name of PROCEDURES) if(program.procedures[name].length){add('');add(`алг ${name}`);add('нач');body(program.procedures[name]);add('кон');}
  return { text: lines.map(l=>l.text).join('\n'), lines, mapping };
}
