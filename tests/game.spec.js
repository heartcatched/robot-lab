import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const found=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')found.push(msg.text());});
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('./');await page.evaluate(()=>document.fonts.ready);if(await page.locator('#start-button').isVisible())await page.locator('#start-button').click();await page.locator('#run-speed').selectOption('200');
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
async function palette(page){if(!await page.locator('#direction-palette').isVisible())await page.locator('#add-command').click();}
async function closePalette(page){if(await page.locator('#palette-dialog').isVisible())await page.locator('#close-palette').click();}
async function directions(page,...dirs){await palette(page);for(const dir of dirs)await page.locator(`[data-direction="${dir}"]`).click();await closePalette(page);}
async function go(page,id){const chapters=['Основы','Циклы','Рисуем','Условия','Пока','Алгоритмы'];const ch=id<=4?0:id<=8?1:id<=10?2:id<=12?3:id<=16?4:5;if(!await page.locator('#chapter-select').isVisible())await page.locator('#levels-button').click();await page.locator('#chapter-select').selectOption(chapters[ch]);await page.locator(`[data-level="${id}"]`).click();}
async function success(page){await page.locator('#run-button').click();await expect(page.locator('#feedback')).toHaveClass(/success/,{timeout:25000});}
async function addType(page,type){await palette(page);await page.locator(`[data-type="${type}"]`).click();await closePalette(page);}
async function root(page){await page.locator('.root-list > .insert-button').click();}
async function chooseBlock(page,text,value){await page.locator('.block-head').filter({hasText:text}).first().click();if(value!==undefined)await page.locator('#block-value').selectOption(value);}
async function confirm(page){await page.locator('#confirm-ok').click();}
async function sandboxMode(page){await page.locator('#sandbox-mode').click();if(await page.locator('#field-settings-dialog').isVisible())await page.locator('#field-settings-done').click();}
async function fieldTool(page,tool){await page.locator('#field-settings-button').click();await page.locator('#field-tool').selectOption(tool);await page.locator('#field-settings-done').click();}
async function title(page,text){await page.locator('#field-settings-button').click();await page.locator('#sandbox-title').fill(text);await page.locator('#field-settings-done').click();}
async function projectAction(page,id){await page.locator('#project-menu-button').click();await page.locator('#'+id).click();}
async function allSaves(page){await page.locator('#quick-results').click();await page.locator('#all-saves').click();}
async function fitsScreen(page){
  const boxes=await page.evaluate(()=>['board','run-button','program'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:[innerWidth,innerHeight]};}));
  for(const box of boxes){expect(box.left,box.id).toBeGreaterThanOrEqual(0);expect(box.top,box.id).toBeGreaterThanOrEqual(0);expect(box.right,box.id).toBeLessThanOrEqual(box.viewport[0]);expect(box.bottom,box.id).toBeLessThanOrEqual(box.viewport[1]);expect(box.height,box.id).toBeGreaterThanOrEqual(box.id==='program'?35:40);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test('Build, run, move, delete and preserve a basic program',async({page})=>{
  await directions(page,'up','right');await page.locator('#move-earlier').click();
  await expect(page.locator('.block-value').first()).toHaveValue('right');await page.locator('#delete-block').click();
  await page.locator('.block-head').click();await page.locator('#block-value').selectOption('right');await directions(page,'right','right');
  await success(page);await expect(page.locator('#journey-count')).toHaveText('1 / 20');
  await page.reload();await expect(page.locator('.block')).toHaveCount(3);await expect(page.locator('#journey-count')).toHaveText('1 / 20');
});
test('Original debugging level can be repaired by selecting the wrong block',async({page})=>{
  await go(page,4);await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('преграда');
  await expect(page.locator('.block.failed')).toHaveCount(1);await page.locator('.block.failed .block-head').click();await page.locator('#block-value').selectOption('up');await success(page);
});
test('A loop and a command after it are constructed in the visible editor',async({page})=>{
  await go(page,7);await addType(page,'repeat');await directions(page,'up','right');await chooseBlock(page,'Повторить','3');await root(page);await directions(page,'up');await success(page);
  await page.locator('#code-view').click();await expect(page.locator('#kumir-code')).toContainText('нц 3 раз');await expect(page.locator('#kumir-code')).toContainText('кц');
});
test('Paint feedback distinguishes missing and extra cells',async({page})=>{
  await go(page,9);await addType(page,'paint');await directions(page,'right','right','right');await page.locator('#run-button').click();
  await expect(page.locator('#feedback')).toContainText('осталось закрасить 1, лишних закрашенных клеток — 1');await expect(page.locator('.paint-missing')).toHaveCount(1);await expect(page.locator('.paint-extra')).toHaveCount(1);
  await chooseBlock(page,'Закрасить');await page.locator('#move-later').click();await success(page);await expect(page.locator('.cell.painted')).toHaveCount(1);
});
test('Conditions handle both branches and all three fields',async({page})=>{
  await go(page,12);await addType(page,'if');await directions(page,'up');await chooseBlock(page,'Если','free:up');
  await page.locator('[data-branch="else"]').click();await directions(page,'right');await success(page);
  await expect(page.locator('#feedback')).toContainText('всех трёх');await expect(page.locator('.variant-pass')).toHaveCount(3);
});
test('A program solving only the visible variant does not earn completion',async({page})=>{
  await go(page,11);await addType(page,'if');await directions(page,'right');await root(page);await directions(page,'right','left');await page.locator('#run-button').click();
  await expect(page.locator('#feedback')).toContainText('Проверь поле 2');await expect(page.locator('#journey-count')).toHaveText('0 / 20');
  await page.locator('#feedback button').click();await expect(page.locator('[data-variant="1"]')).toHaveClass(/active/);
});
test('Step, pause, continue and stop share the same execution',async({page})=>{
  await directions(page,'right','right','right');await page.locator('#step-button').click();await expect(page.locator('#board-status')).toContainText('1. Шаг');
  await expect(page.locator('#clear-program')).toBeDisabled();await expect(page.locator('#run-button')).toContainText('Продолжить');
  await page.locator('#step-button').click();await expect(page.locator('#board-status')).toContainText('2. Шаг');await success(page);
  await page.locator('#run-speed').selectOption('1000');await page.locator('#run-button').click();await page.locator('#run-button').click();
  await expect(page.locator('#run-button')).toContainText('Продолжить');await page.waitForTimeout(1100);await expect(page.locator('#board-status')).toContainText('1. Шаг');
  await page.locator('#stop-button').click();await expect(page.locator('#feedback')).toContainText('Запуск остановлен');await expect(page.locator('.block')).toHaveCount(3);
  await page.waitForTimeout(1100);await expect(page.locator('#feedback')).toContainText('Запуск остановлен');
});
test('While loop and procedure calls can be created without loading a solution',async({page})=>{
  await go(page,13);await addType(page,'while');await directions(page,'right');await success(page);
  await go(page,17);await page.locator('[data-scope="А"]').click();await addType(page,'paint');await directions(page,'right');
  await page.locator('[data-scope="main"]').click();await addType(page,'call');await directions(page,'right');await addType(page,'call');await success(page);
  await page.locator('#code-view').click();await expect(page.locator('#kumir-code')).toContainText('алг А');await expect(page.locator('#kumir-code')).toContainText('закрасить');
});
test('Condition steps highlight the matching Kumir line and page anchors do not cancel execution',async({page})=>{
  await go(page,13);await addType(page,'while');await directions(page,'right');await page.locator('#step-button').click();
  await expect(page.locator('#board-status')).toContainText('справа свободно: да');await page.locator('#code-view').click();
  await expect(page.locator('#kumir-code .executing')).toContainText('нц пока справа свободно');
  await page.evaluate(()=>{location.hash='workspace';});await expect(page.locator('#run-button')).toContainText('Продолжить');
  await page.locator('#step-button').click();await expect(page.locator('#kumir-code .executing')).toHaveText('    вправо');
  await success(page);
});
test('Every lesson is reachable, complete with a worked example and persists honestly',async({page})=>{
  test.setTimeout(180000);
  for(let id=1;id<=20;id++){
    await go(page,id);await page.locator('#hint-button').click();await page.locator('#solution-button').click();await page.locator('#load-solution').click();await success(page);
  }
  await expect(page.locator('#journey-count')).toHaveText('20 / 20');await page.locator('#quick-results').click();
  await expect(page.getByRole('heading',{name:'Ты управляешь алгоритмами!'})).toBeVisible();await expect(page.locator('.result-label',{hasText:'С решением'})).toHaveCount(20);
  await page.screenshot({path:'artifacts/results-v2.png',fullPage:true});
});
test('Legacy progress migrates with attempts, help and original backup intact',async({page})=>{
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('robokhod-progress-v1',JSON.stringify({version:1,current:4,levels:{1:{program:['right','right','right'],completed:true,independent:true,attempts:4,hintUsed:false,solutionUsed:false},4:{program:['right','up','right','down','right'],completed:false,attempts:2,hintUsed:true,solutionUsed:false}}}));});
  await page.reload();await expect(page.locator('#level-title')).toHaveText('Дело в одной команде');await expect(page.locator('#journey-count')).toHaveText('1 / 20');await expect(page.locator('.block')).toHaveCount(5);
  const migrated=await page.evaluate(()=>({v1:JSON.parse(localStorage.getItem('robokhod-progress-v1')),v2:JSON.parse(localStorage.getItem('robokhod-progress-v2'))}));
  expect(migrated.v1.version).toBe(1);expect(migrated.v2.levels[1].attempts).toBe(4);expect(migrated.v2.levels[4].hintUsed).toBe(true);
});
test('Sandbox builds walls, saves a draft and imports its exported file',async({page})=>{
  await sandboxMode(page);await title(page,'Мой полигон');
  await fieldTool(page,'edge');await page.locator('[data-cell="3,2"]').click();await page.locator('[data-edge="right"]').click();await expect(page.locator('.edge-line')).toHaveCount(2);
  await fieldTool(page,'targets');await page.locator('[data-cell="4,2"]').click();await directions(page,'right','right');await addType(page,'paint');await directions(page,'right','right');await success(page);
  await page.locator('#save-project').click();await expect(page.locator('#sandbox-save-status')).toContainText('Сохранено');
  const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  const downloadPromise=page.waitForEvent('download');await projectAction(page,'export-project');const download=await downloadPromise;
  const path=await download.path(),file=await readFile(path,'utf8');expect(JSON.parse(file)).toEqual(JSON.parse(saved));
  await projectAction(page,'new-project');await confirm(page);await page.locator('#field-settings-done').click();await expect(page.locator('.block')).toHaveCount(0);
  await page.locator('#project-file').setInputFiles(path);await confirm(page);await expect(page.locator('#sandbox-title')).toHaveValue('Мой полигон');await expect(page.locator('.block')).toHaveCount(5);await expect(page.locator('.edge-line')).toHaveCount(2);
  await page.reload();await sandboxMode(page);await expect(page.locator('#sandbox-title')).toHaveValue('Мой полигон');
});
test('Task links omit answers and do not overwrite an existing sandbox draft',async({page,context})=>{
  await sandboxMode(page);await title(page,'Личный черновик');await directions(page,'up');await page.locator('#save-project').click();
  const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  await title(page,'Задача другу');await page.locator('#share-project').click();const url=await page.locator('#share-url').inputValue();
  const payload=JSON.parse(Buffer.from(new URL(url).hash.slice(6),'base64url').toString());expect(payload.program).toBeUndefined();expect(JSON.stringify(payload)).not.toContain('procedures');
  const friend=await context.newPage();await friend.goto(url);await expect(friend.locator('#sandbox-title')).toHaveValue('Задача другу');await expect(friend.locator('.block')).toHaveCount(0);
  expect(await friend.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
  await projectAction(friend,'load-project');await confirm(friend);await expect(friend.locator('#sandbox-title')).toHaveValue('Личный черновик');await expect(friend.locator('.block')).toHaveCount(1);await friend.close();
});
test('Bad files and damaged task links leave progress and drafts unchanged',async({page})=>{
  await sandboxMode(page);await page.locator('#save-project').click();const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  await page.locator('#project-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await expect(page.locator('#feedback')).toContainText('Файл не открыт');
  expect(await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
  await page.goto('./#task=broken');await expect(page.locator('#feedback')).toContainText('Не удалось открыть ссылку');expect(await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
});
test('Empty programs, empty blocks, recursive calls and field conflicts explain what to fix',async({page})=>{
  await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('хотя бы одну');
  await sandboxMode(page);await addType(page,'while');await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('внутрь блока');
  await page.locator('[data-scope="А"]').click();await addType(page,'call');await expect(page.locator('#feedback')).toContainText('сам себя');await expect(page.locator('.block')).toHaveCount(0);
  await fieldTool(page,'blocks');await page.locator('[data-cell="4,0"]').click();await expect(page.locator('#feedback')).toContainText('Камень не может');
});
test('Disabled localStorage still allows completing a lesson',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));await page.reload();await page.locator('#start-button').click();await page.locator('#run-speed').selectOption('200');
  await expect(page.locator('#storage-notice')).toBeVisible();await directions(page,'right','right','right');await success(page);
});
test('Keyboard controls and progress reset have a deliberate confirmation',async({page})=>{
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await page.locator('#help-button').focus();await page.keyboard.press('Enter');await expect(page.locator('#help-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
  await palette(page);await page.locator('[data-direction="right"]').focus();for(let i=0;i<3;i++)await page.keyboard.press('Enter');await closePalette(page);await success(page);
  await page.locator('#quick-results').click();await page.locator('#reset-progress').click();await page.locator('#confirm-cancel').click();await expect(page.locator('#journey-count')).toHaveText('1 / 20');
  await page.locator('#quick-results').click();await page.locator('#reset-progress').click();await confirm(page);await expect(page.locator('#journey-count')).toHaveText('0 / 20');await expect(page.locator('.block')).toHaveCount(0);
});
for(const [width,height] of [[360,740],[390,844],[768,1024],[1366,768],[1440,900]])test(`Usable course and sandbox at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height});await fitsScreen(page);
  await page.screenshot({path:`artifacts/workspace-v3-${width}.png`,fullPage:true});await directions(page,'right','right','right');await success(page);
  await go(page,20);await page.locator('#hint-button').click();await page.locator('#solution-button').click();await page.locator('#load-solution').click();
  await fitsScreen(page);await page.locator('#step-button').click();await fitsScreen(page);await page.locator('#stop-button').click();
  await page.screenshot({path:`artifacts/advanced-v3-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await sandboxMode(page);await page.locator('#field-settings-button').click();await page.locator('#sandbox-cols').selectOption('8');await confirm(page);await page.locator('#field-settings-done').click();await fieldTool(page,'edge');await page.locator('[data-cell="2,2"]').click();await page.locator('[data-edge="up"]').click();
  await expect(page.locator('.edge-line')).toHaveCount(2);await fitsScreen(page);await page.screenshot({path:`artifacts/sandbox-v3-${width}.png`,fullPage:true});
});

test('Welcome is shown once and returning pupils resume without running',async({page})=>{
  await page.evaluate(()=>localStorage.clear());await page.reload();await expect(page.locator('#page-title')).toBeVisible();await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#start-button').click();await go(page,7);await directions(page,'right');await page.locator('#home-button').click();await expect(page.locator('#page-title')).toBeVisible();
  await page.reload();await expect(page.locator('#level-title')).toHaveText('Ещё один шаг');await expect(page.locator('.block')).toHaveCount(1);await expect(page.locator('#stop-button')).toBeDisabled();await expect(page.locator('#board-status')).toContainText('ждёт');
});
test('Undo is isolated by lesson and keeps grades, help and attempt counts',async({page})=>{
  await directions(page,'right','right','right');await success(page);await page.locator('#hint-button').click();await page.keyboard.press('Escape');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('robokhod-progress-v2')).levels[1]);
  await page.locator('#undo-button').click();await expect(page.locator('.block')).toHaveCount(2);await expect(page.locator('#journey-count')).toHaveText('1 / 20');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('robokhod-progress-v2')).levels[1]);for(const key of ['completed','independent','hintUsed','attempts'])expect(after[key]).toEqual(before[key]);
  await go(page,2);await expect(page.locator('#undo-button')).toBeDisabled();await directions(page,'up');await go(page,1);await page.locator('#undo-button').click();await expect(page.locator('.block')).toHaveCount(1);
  await go(page,2);await expect(page.locator('.block')).toHaveCount(1);await page.keyboard.press('Control+z');await expect(page.locator('.block')).toHaveCount(0);
});
test('Inline parameters retain focus, insertion context and undo',async({page})=>{
  await go(page,7);await addType(page,'repeat');await directions(page,'up','right');const control=page.locator('.block-value').first();await control.focus();await control.selectOption('3');await expect(control).toBeFocused();
  await page.locator('[data-after]').first().click();await directions(page,'up');await expect(page.locator('.root-list > .block')).toHaveCount(2);await success(page);
  await page.locator('#undo-button').click();await expect(page.locator('.root-list > .block')).toHaveCount(1);await expect(control).toHaveValue('3');
  await page.locator('#undo-button').click();await expect(control).toHaveValue('2');
});
test('All variant results are inspected after the selected variant fails',async({page})=>{
  await go(page,11);await addType(page,'if');await directions(page,'right');await root(page);await directions(page,'right','left');await page.locator('[data-variant="1"]').click();await page.locator('#run-button').click();
  await expect(page.locator('#feedback')).toContainText('Пройдено 2 из 3');await expect(page.locator('.variant-pass')).toHaveCount(2);await expect(page.locator('.blocked-edge')).toHaveCount(1);
  await page.locator('[data-variant="0"]').click();await expect(page.locator('#feedback')).toContainText('Поле 1: пройдено');
  expect(await page.locator('#robot-position').evaluate(el=>el.style.left)).toBe('40%');await page.locator('[data-variant="1"]').click();await expect(page.locator('.blocked-edge')).toHaveCount(1);expect(await page.locator('#robot-position').evaluate(el=>el.style.left)).toBe('20%');
});
test('Sandbox undo restores the field, size, title and program separately',async({page})=>{
  await sandboxMode(page);await fieldTool(page,'edge');await page.locator('[data-cell="2,2"]').click();await page.locator('[data-edge="right"]').click();await expect(page.locator('.edge-line')).toHaveCount(2);
  await title(page,'Проверка отмены');await page.locator('#field-settings-button').click();await page.locator('#sandbox-cols').selectOption('8');await confirm(page);await page.locator('#field-settings-done').click();await expect(page.locator('.cell')).toHaveCount(40);
  await page.locator('#undo-button').click();await expect(page.locator('.cell')).toHaveCount(25);await expect(page.locator('.edge-line')).toHaveCount(2);await expect(page.locator('#level-title')).toHaveText('Проверка отмены');
  await page.locator('#undo-button').click();await expect(page.locator('#level-title')).not.toHaveText('Проверка отмены');await page.locator('#undo-button').click();await expect(page.locator('.edge-line')).toHaveCount(0);
});
test('Full backup restores lessons, saved draft and unsaved project after preview',async({page,browser})=>{
  await directions(page,'right','right','right');await success(page);await go(page,4);await page.locator('#hint-button').click();await page.keyboard.press('Escape');
  await sandboxMode(page);await title(page,'Сохранённый проект');await directions(page,'right');await page.locator('#save-project').click();await title(page,'Незавершённая задача');await directions(page,'up');
  await allSaves(page);const promise=page.waitForEvent('download');await page.locator('#download-backup').click();const file=await (await promise).path();const saved=JSON.parse(await readFile(file,'utf8'));
  expect(saved.progress.current).toBe(4);expect(saved.sandboxSaved.program.main).toHaveLength(1);expect(saved.sandboxWorking.program.main).toHaveLength(2);
  const context=await browser.newContext();const target=await context.newPage();target.on('dialog',d=>d.accept());await target.goto(page.url());await target.locator('#start-button').click();await allSaves(target);await target.locator('#backup-file').setInputFiles(file);
  await expect(target.locator('#backup-summary')).toContainText('1 пройденных');expect(await target.evaluate(()=>localStorage.getItem('robokhod-progress-v2'))).toBeNull();await target.keyboard.press('Escape');await expect(target.locator('#journey-count')).toHaveText('0 / 20');
  await allSaves(target);await target.locator('#backup-file').setInputFiles(file);await target.locator('#restore-backup').click();await expect(target.locator('#level-title')).toHaveText('Дело в одной команде');await expect(target.locator('#journey-count')).toHaveText('1 / 20');
  const state=await target.evaluate(()=>JSON.parse(localStorage.getItem('robokhod-progress-v2')));expect(state.levels[1]).toEqual(saved.progress.levels[1]);expect(state.levels[4].hintUsed).toBe(true);
  await sandboxMode(target);await expect(target.locator('#level-title')).toHaveText('Незавершённая задача');await expect(target.locator('.block')).toHaveCount(2);await expect(target.locator('#sandbox-save-status')).toContainText('Есть изменения');
  const stored=await target.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));expect(JSON.parse(stored).title).toBe('Сохранённый проект');await allSaves(target);await target.locator('#backup-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(target.locator('#backup-status')).toContainText('Файл не открыт');expect(await target.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(stored);await context.close();
});

 test('A broken task link is explained on a first visit',async({page})=>{
  await page.evaluate(()=>localStorage.clear());await page.goto('./#task=broken');await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#feedback')).toContainText('Не удалось открыть ссылку');await page.locator('#feedback summary').click();await expect(page.locator('#feedback p')).toBeVisible();
});
