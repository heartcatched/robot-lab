import {expect} from '@playwright/test';

export async function checkLongMobileProgram(page){
  await page.goto('./');
  await page.evaluate(async()=>{
    const {freshState,STORAGE_KEY}=await import(new URL('storage.js',location.href).href);
    const {LEVELS}=await import(new URL('levels.js',location.href).href);
    const {move,repeat,until,when}=await import(new URL('model.js',location.href).href);
    const state=freshState(LEVELS);
    state.current=20;
    state.levels[20].program.main=[repeat(2,[
      ...Array.from({length:8},()=>move('right')),
      until('free:right',[when('free:up',
        Array.from({length:5},()=>move('up')),
        Array.from({length:5},()=>move('down')))]),
      move('left')
    ]),...Array.from({length:5},()=>move('down'))];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('#level-title')).toHaveText('Один код — три мира');
  const original=await page.locator('#program').evaluate(el=>el.clientHeight);
  const count=await page.locator('.block').count();
  const saved=await page.evaluate(()=>localStorage.getItem('robokhod-progress-v2'));

  await page.locator('#editor-size').click();
  await expect(page.locator('#editor-size')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.board-panel')).toBeHidden();
  const expanded=await page.locator('#program').evaluate(el=>el.clientHeight);
  expect(expanded).toBeGreaterThan(original+180);
  expect(await page.locator('#run-button').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

  await page.locator('[data-branch="then"]').last().click();
  await page.locator('[data-direction="left"]').click();
  await page.locator('#close-palette').click();
  await expect(page.locator('.block')).toHaveCount(count+1);
  const visible=()=>page.locator('#program').evaluate(el=>{
    const box=el.getBoundingClientRect();
    const selected=el.querySelector('.selected > .block-header').getBoundingClientRect();
    return selected.top>=box.top&&selected.bottom<=box.bottom;
  });
  await expect.poll(visible).toBe(true);
  expect(await page.locator('#program').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const addedId=await page.locator('#block-value').getAttribute('data-value');
  await page.locator('#block-value').selectOption('right');
  await expect(page.locator('#block-value')).toHaveValue('right');
  await page.locator('#undo-button').click();
  await expect(page.locator(`[data-value="${addedId}"]`)).toHaveValue('left');
  await page.locator('#undo-button').click();
  await expect(page.locator('.block')).toHaveCount(count);
  expect(await page.evaluate(()=>localStorage.getItem('robokhod-progress-v2'))).toBe(saved);

  await page.locator('#code-view').click();
  await expect(page.locator('#kumir-code')).toContainText('нц');
  expect(await page.locator('#kumir-code').evaluate(el=>el.clientHeight)).toBeGreaterThan(original+180);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#blocks-view').click();
  await page.locator('#add-command').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#palette-dialog')).not.toBeVisible();
  await expect(page.locator('#editor-size')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor-size')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.board-panel')).toBeVisible();

  await page.locator('#editor-size').click();
  await page.locator('#step-button').click();
  await expect(page.locator('#editor-size')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.board-panel')).toBeVisible();
  await expect(page.locator('#stop-button')).toBeEnabled();
  await page.locator('#stop-button').click();
  await page.locator('#editor-size').click();
  await page.setViewportSize({width:900,height:700});
  await expect(page.locator('#editor-size')).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/editor-expanded/);
  await expect(page.locator('.board-panel')).toBeVisible();
  await expect(page.locator('.block')).toHaveCount(count);
}
