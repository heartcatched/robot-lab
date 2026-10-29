import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const found=[];errors.set(page,found);page.on('pageerror',e=>found.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')found.push(msg.text());});
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/');await page.evaluate(()=>document.fonts.ready);await page.locator('#run-speed').selectOption('200');
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
async function directions(page,...dirs){for(const dir of dirs)await page.locator(`[data-direction="${dir}"]`).click();}
async function go(page,id){const chapters=['Основы','Циклы','Рисуем','Условия','Пока','Алгоритмы'];const ch=id<=4?0:id<=8?1:id<=10?2:id<=12?3:id<=16?4:5;await page.locator('#chapter-select').selectOption(chapters[ch]);await page.locator(`[data-level="${id}"]`).click();}
async function success(page){await page.locator('#run-button').click();await expect(page.locator('#feedback')).toHaveClass(/success/,{timeout:25000});}
async function addType(page,type){await page.locator(`[data-type="${type}"]`).click();}
async function root(page){await page.locator('.root-list > .insert-button').click();}
async function chooseBlock(page,text,value){await page.locator('.block-head').filter({hasText:text}).first().click();if(value!==undefined)await page.locator('#block-value').selectOption(value);}
async function confirm(page){await page.locator('#confirm-ok').click();}

test('Build, run, move, delete and preserve a basic program',async({page})=>{
  await directions(page,'up','right');await page.locator('#move-earlier').click();
  await expect(page.locator('.block-head').first()).toContainText('Вправо');await page.locator('#delete-block').click();
  await page.locator('.block-head').click();await page.locator('#block-value').selectOption('right');await directions(page,'right','right');
  await success(page);await expect(page.locator('#journey-count')).toHaveText('1 / 20');
  await page.reload();await expect(page.locator('.block')).toHaveCount(3);await expect(page.locator('#journey-count')).toHaveText('1 / 20');
});
test('Original debugging level can be repaired by selecting the wrong block',async({page})=>{
  await go(page,4);await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('преграда');
  await expect(page.locator('.block.failed')).toHaveCount(1);await page.locator('.block.failed > .block-head').click();await page.locator('#block-value').selectOption('up');await success(page);
});
test('A loop and a command after it are constructed in the visible editor',async({page})=>{
  await go(page,7);await addType(page,'repeat');await directions(page,'up','right');await chooseBlock(page,'Повторить','3');await root(page);await directions(page,'up');await success(page);
  await page.locator('#code-view').click();await expect(page.locator('#kumir-code')).toContainText('нц 3 раз');await expect(page.locator('#kumir-code')).toContainText('кц');
});
test('Paint feedback distinguishes missing and extra cells',async({page})=>{
  await go(page,9);await addType(page,'paint');await directions(page,'right','right','right');await page.locator('#run-button').click();
  await expect(page.locator('#feedback')).toContainText('осталось закрасить 1, лишних закрашенных клеток — 1');
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
  await expect(page.locator('#journey-count')).toHaveText('20 / 20');await page.locator('#journey-count').click();
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
  await page.locator('#sandbox-mode').click();await page.locator('#sandbox-title').fill('Мой полигон');
  await page.locator('#field-tool').selectOption('edge');await page.locator('[data-cell="3,2"]').click();await page.locator('[data-edge="right"]').click();await expect(page.locator('.edge-line')).toHaveCount(2);
  await page.locator('#field-tool').selectOption('targets');await page.locator('[data-cell="4,2"]').click();await directions(page,'right','right');await addType(page,'paint');await directions(page,'right','right');await success(page);
  await page.locator('#save-project').click();await expect(page.locator('#sandbox-save-status')).toContainText('Сохранено');
  const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-project').click();const download=await downloadPromise;
  const path=await download.path(),file=await readFile(path,'utf8');expect(JSON.parse(file)).toEqual(JSON.parse(saved));
  await page.locator('#new-project').click();await confirm(page);await expect(page.locator('.block')).toHaveCount(0);
  await page.locator('#project-file').setInputFiles(path);await confirm(page);await expect(page.locator('#sandbox-title')).toHaveValue('Мой полигон');await expect(page.locator('.block')).toHaveCount(5);await expect(page.locator('.edge-line')).toHaveCount(2);
  await page.reload();await page.locator('#sandbox-mode').click();await expect(page.locator('#sandbox-title')).toHaveValue('Мой полигон');
});
test('Task links omit answers and do not overwrite an existing sandbox draft',async({page,context})=>{
  await page.locator('#sandbox-mode').click();await page.locator('#sandbox-title').fill('Личный черновик');await directions(page,'up');await page.locator('#save-project').click();
  const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  await page.locator('#sandbox-title').fill('Задача другу');await page.locator('#share-project').click();const url=await page.locator('#share-url').inputValue();
  const payload=JSON.parse(Buffer.from(new URL(url).hash.slice(6),'base64url').toString());expect(payload.program).toBeUndefined();expect(JSON.stringify(payload)).not.toContain('procedures');
  const friend=await context.newPage();await friend.goto(url);await expect(friend.locator('#sandbox-title')).toHaveValue('Задача другу');await expect(friend.locator('.block')).toHaveCount(0);
  expect(await friend.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
  await friend.locator('#load-project').click();await confirm(friend);await expect(friend.locator('#sandbox-title')).toHaveValue('Личный черновик');await expect(friend.locator('.block')).toHaveCount(1);await friend.close();
});
test('Bad files and damaged task links leave progress and drafts unchanged',async({page})=>{
  await page.locator('#sandbox-mode').click();await page.locator('#save-project').click();const saved=await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'));
  await page.locator('#project-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await expect(page.locator('#feedback')).toContainText('Файл не открыт');
  expect(await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
  await page.goto('/#task=broken');await expect(page.locator('#feedback')).toContainText('Не удалось открыть ссылку');expect(await page.evaluate(()=>localStorage.getItem('robokhod-sandbox-v1'))).toBe(saved);
});
test('Empty programs, empty blocks, recursive calls and field conflicts explain what to fix',async({page})=>{
  await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('хотя бы одну');
  await page.locator('#sandbox-mode').click();await addType(page,'while');await page.locator('#run-button').click();await expect(page.locator('#feedback')).toContainText('внутрь блока');
  await page.locator('[data-scope="А"]').click();await addType(page,'call');await expect(page.locator('#feedback')).toContainText('сам себя');await expect(page.locator('.block')).toHaveCount(0);
  await page.locator('#field-tool').selectOption('blocks');await page.locator('[data-cell="4,0"]').click();await expect(page.locator('#feedback')).toContainText('Камень не может');
});
test('Disabled localStorage still allows completing a lesson',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));await page.reload();await page.locator('#run-speed').selectOption('200');
  await expect(page.locator('#storage-notice')).toBeVisible();await directions(page,'right','right','right');await success(page);
});
test('Keyboard controls and progress reset have a deliberate confirmation',async({page})=>{
  await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.locator('#help-button').focus();await page.keyboard.press('Enter');await expect(page.locator('#help-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
  await page.locator('[data-direction="right"]').focus();for(let i=0;i<3;i++)await page.keyboard.press('Enter');await success(page);
  await page.locator('#journey-count').click();await page.locator('#reset-progress').click();await page.locator('#confirm-cancel').click();await expect(page.locator('#journey-count')).toHaveText('1 / 20');
  await page.locator('#journey-count').click();await page.locator('#reset-progress').click();await confirm(page);await expect(page.locator('#journey-count')).toHaveText('0 / 20');await expect(page.locator('.block')).toHaveCount(0);
});
for(const width of [360,390,768,1440])test(`Usable course and sandbox at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width<600?844:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/home-v2-${width}.png`,fullPage:true});await directions(page,'right','right','right');await success(page);
  await go(page,20);await page.locator('#hint-button').click();await page.locator('#solution-button').click();await page.locator('#load-solution').click();
  await page.screenshot({path:`artifacts/advanced-v2-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#sandbox-mode').click();await page.locator('#sandbox-cols').selectOption('8');await confirm(page);await page.locator('#field-tool').selectOption('edge');await page.locator('[data-cell="2,2"]').click();await page.locator('[data-edge="up"]').click();
  await expect(page.locator('.edge-line')).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/sandbox-v2-${width}.png`,fullPage:true});
});
