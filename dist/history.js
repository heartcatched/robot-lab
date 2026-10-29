import { clone } from './model.js';
export class EditHistory {
  constructor(limit=50){this.limit=limit;this.entries=new Map();}
  record(key,before,after){
    if(JSON.stringify(before)===JSON.stringify(after))return;
    const items=this.entries.get(key)||[];items.push(clone(before));if(items.length>this.limit)items.shift();this.entries.set(key,items);
  }
  canUndo(key){return (this.entries.get(key)?.length||0)>0;}
  undo(key){const item=this.entries.get(key)?.pop();return item?clone(item):null;}
  clear(key){if(key)this.entries.delete(key);else this.entries.clear();}
}
