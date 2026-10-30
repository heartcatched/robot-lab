import {test,expect} from '@playwright/test';
import {checkLongMobileProgram} from './mobile-editor.helpers.js';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
test('WebKit expands a long nested program and reveals inserted commands',async({page})=>{
  await checkLongMobileProgram(page);
});
test('WebKit mobile runs, steps and resumes progress under the hosted path',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await page.locator('#start-button').click();
  await page.locator('#add-command').click();for(let i=0;i<3;i++)await page.locator('[data-direction="right"]').click();await page.locator('#close-palette').click();await page.locator('#step-button').click();await expect(page.locator('#board-status')).toContainText('1. Шаг');
  await page.locator('#run-speed').selectOption('200');await page.locator('#run-button').click();await expect(page.locator('#feedback')).toHaveClass(/success/);await page.reload();await expect(page.locator('.block')).toHaveCount(3);await expect(page.locator('#quick-results')).toHaveText('1 / 20');await expect(page.locator('#stop-button')).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const r=await page.locator('#run-button').boundingBox();expect(r.y+r.height).toBeLessThan(844);expect(errors).toEqual([]);
});
test('WebKit mobile edits the sandbox, undoes and shares without an answer',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await page.locator('#start-button').click();await page.locator('#sandbox-mode').click();await page.locator('#sandbox-title').fill('Задача WebKit');await page.locator('#field-tool').selectOption('blocks');await page.locator('#field-settings-done').click();
  await page.locator('[data-cell="2,2"]').click();await expect(page.locator('.cell.wall')).toHaveCount(1);await page.locator('#undo-button').click();await expect(page.locator('.cell.wall')).toHaveCount(0);
  await page.locator('#add-command').click();await page.locator('[data-direction="right"]').click();await page.locator('#close-palette').click();await page.locator('#save-project').click();await page.locator('#share-project').click();const url=await page.locator('#share-url').inputValue();expect(new URL(url).pathname).toBe(new URL(page.url()).pathname);
  const other=await context.newPage();await other.goto(url);await expect(other.locator('#level-title')).toHaveText('Задача WebKit');await expect(other.locator('.block')).toHaveCount(0);await expect(other.locator('#workspace')).toBeVisible();expect(errors).toEqual([]);await other.close();
});
