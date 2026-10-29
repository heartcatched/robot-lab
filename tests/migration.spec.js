import {test,expect} from '@playwright/test';
import {blankProject,encodeTask} from '../dist/sandbox.js';
import {PRIMARY_SITE_URL,LEGACY_HOST} from '../dist/deployment.js';
test('Old host offers backup and keeps the shared task when moving',async({page,baseURL})=>{
  await page.setViewportSize({width:360,height:740});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(`https://${LEGACY_HOST}/**`,async route=>{const path=new URL(route.request().url()).pathname;const response=await route.fetch({url:new URL('.'+path,baseURL).href});await route.fulfill({response});});
  const task=blankProject();task.title='Переезжающая задача';const hash=encodeTask(task);await page.goto(`https://${LEGACY_HOST}/${hash}`);
  await expect(page.locator('#migration-notice')).toBeVisible();await expect(page.locator('#level-title')).toHaveText(task.title);await expect(page.locator('#migration-link')).toHaveAttribute('href',PRIMARY_SITE_URL+hash);await expect(page.locator('.block')).toHaveCount(0);
  const button=await page.locator('#run-button').boundingBox();expect(button.y+button.height).toBeLessThanOrEqual(740);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#migration-backup').click();await expect(page.locator('#backup-dialog')).toBeVisible();const downloaded=page.waitForEvent('download');await page.locator('#download-backup').click();expect((await downloaded).suggestedFilename()).toBe('robokhod-backup.json');expect(errors).toEqual([]);
});
