import { test, expect } from '@playwright/test';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = [];
  errors.set(page, found);
  page.on('pageerror', err => found.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') found.push(msg.text()); });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function add(page, ...directions) {
  for (const dir of directions) await page.locator(`#direction-palette [data-direction="${dir}"]`).click();
}
async function loop(page, count, ...directions) {
  await page.getByRole('button', { name: /Повторить/, exact: false }).filter({ has: page.locator('.loop-symbol') }).click();
  await page.getByRole('button', { name: `Повторить ${count} раза`, exact: true }).click();
  for (const dir of directions) await page.locator(`#loop-palette [data-direction="${dir}"]`).click();
  await page.getByRole('button', { name: /Добавить цикл/ }).click();
}
async function successfulRun(page) {
  await page.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(page.locator('#feedback')).toHaveClass(/success/);
}

test('All eight levels can be completed through the visible editor', async ({ page }) => {
  test.setTimeout(90000);
  await add(page, 'right','right','right'); await successfulRun(page);
  await page.locator('[data-level="2"]').click();
  await add(page, 'right','right','up','up'); await successfulRun(page);
  await page.locator('[data-level="3"]').click();
  await add(page, 'up','up','right','right','right','right','down','down'); await successfulRun(page);
  await page.locator('[data-level="4"]').click();
  await page.locator('[data-index="3"]').click();
  await page.getByRole('combobox', { name: 'Заменить выбранную команду' }).selectOption('up');
  await successfulRun(page);
  await page.locator('[data-level="5"]').click();
  await loop(page, 4, 'right'); await successfulRun(page);
  await page.locator('[data-level="6"]').click();
  await loop(page, 3, 'up','right'); await successfulRun(page);
  await page.locator('[data-level="7"]').click();
  await loop(page, 3, 'up','right'); await add(page, 'up'); await successfulRun(page);
  await page.locator('[data-level="8"]').click();
  await loop(page, 2, 'up','up','right','right'); await successfulRun(page);
  await expect(page.locator('#journey-count')).toHaveText('8 / 8');
  await page.getByRole('button', {name:'Мои результаты'}).click();
  await expect(page.getByRole('heading', {name:'Ты управляешь алгоритмами!'})).toBeVisible();
  await expect(page.locator('.result-label', {hasText:'Самостоятельно'})).toHaveCount(8);
  await page.screenshot({path:'artifacts/results-desktop.png',fullPage:true});
});

test('Debugging highlights the wrong command and replacement repairs it', async ({ page }) => {
  await page.locator('[data-level="4"]').click();
  await page.getByRole('button', {name:'Запустить',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('На шаге 4 — препятствие');
  await expect(page.locator('[data-index="3"]')).toHaveClass(/failed/);
  await page.screenshot({path:'artifacts/error-desktop.png',fullPage:true});
  await page.locator('[data-index="3"]').click();
  await page.locator('.replace-select').selectOption('up');
  await successfulRun(page);
});

test('Empty, out-of-bounds, incomplete and loop-required outcomes are actionable', async ({ page }) => {
  await page.getByRole('button',{name:'Запустить',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Добавь хотя бы одну команду');
  await add(page, 'left');
  await page.getByRole('button',{name:'Запустить',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('край поля');
  await page.getByRole('button',{name:'Очистить программу'}).click();
  await add(page, 'right');
  await page.getByRole('button',{name:'Запустить',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Маршрут пока не привёл');
  await page.locator('[data-level="5"]').click();
  await add(page,'right','right','right','right');
  await page.getByRole('button',{name:'Запустить',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('нужно использовать цикл');
  await expect(page.locator('#journey-count')).toHaveText('0 / 8');
});

test('Stop cancels an active run and preserves the program', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await add(page,'right','right','right');
  await page.getByRole('button',{name:'Запустить',exact:true}).click();
  await expect(page.locator('#clear-program')).toBeDisabled();
  await expect(page.locator('[data-level="2"]')).toBeDisabled();
  await page.getByRole('button',{name:'Стоп',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Запуск остановлен');
  await expect(page.locator('.command')).toHaveCount(3);
  await page.waitForTimeout(1000);
  await expect(page.locator('#feedback')).toContainText('Запуск остановлен');
  await expect(page.locator('#journey-count')).toHaveText('0 / 8');
  await successfulRun(page);
});

test('Command movement, deletion and loop editing work', async ({ page }) => {
  await add(page, 'up','right');
  await page.getByRole('button',{name:'Переместить команду раньше'}).click();
  await expect(page.locator('[data-index="0"]')).toHaveAttribute('aria-label', 'Команда 1: Вправо');
  await page.getByRole('button',{name:'Удалить выбранную команду'}).click();
  await expect(page.locator('.command')).toHaveCount(1);
  await page.locator('[data-level="5"]').click();
  await loop(page, 2, 'right');
  await page.getByRole('button',{name:'Изменить цикл',exact:true}).click();
  await page.getByRole('button',{name:'Повторить 4 раза',exact:true}).click();
  await page.getByRole('button',{name:/Сохранить изменения/}).click();
  await successfulRun(page);
});

test('Programs and completion persist on reload and progress reset is deliberate', async ({ page }) => {
  await add(page,'right','right','right'); await successfulRun(page);
  await page.reload();
  await expect(page.locator('#journey-count')).toHaveText('1 / 8');
  await expect(page.locator('.command')).toHaveCount(3);
  await page.getByRole('button',{name:'Открыть результаты'}).click();
  await page.getByRole('button',{name:'Сбросить весь прогресс'}).click();
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await expect(page.locator('#reset-confirm')).toBeHidden();
  await page.getByRole('button',{name:'Сбросить весь прогресс'}).click();
  await page.getByRole('button',{name:'Да, начать заново'}).click();
  await expect(page.locator('#journey-count')).toHaveText('0 / 8');
  await expect(page.locator('.command')).toHaveCount(0);
});

test('Help and solutions remain available after changing levels and report assistance honestly', async ({ page }) => {
  await page.getByRole('button',{name:'Подсказка',exact:true}).click();
  await page.getByRole('button',{name:/Показать решение/}).click();
  await page.getByRole('button',{name:/Загрузить в редактор/}).click();
  await successfulRun(page);
  await page.locator('[data-level="2"]').click();
  await page.getByRole('button',{name:'Подсказка',exact:true}).click();
  await expect(page.getByRole('button',{name:/Показать решение/})).toBeVisible();
  await page.getByRole('button',{name:'Открыть результаты'}).click();
  await expect(page.locator('.result-label',{hasText:'С решением'})).toHaveCount(1);
});

test('No localStorage is required to finish a level', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage disabled');}});
  });
  await page.reload();
  await expect(page.locator('#storage-notice')).toBeVisible();
  await add(page,'right','right','right'); await successfulRun(page);
});

test('Keyboard navigation and dialogs work without a pointer', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.locator('#help-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-button')).toBeFocused();
  await page.locator('#direction-palette [data-direction="right"]').focus();
  for (let i=0; i<3; i++) await page.keyboard.press('Enter');
  await page.locator('#run-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#feedback')).toHaveClass(/success/);
});

for (const width of [360,390,768,1440]) {
  test(`Layout and functional walkthrough at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:width<600?844:1000});
    await expect(page.getByRole('heading',{name:'Командуй роботом.'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/home-${width}.png`,fullPage:true});
    await add(page,'right','right','right'); await successfulRun(page);
    await page.locator('[data-level="6"]').click();
    await loop(page,3,'up','right');
    await successfulRun(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Открыть результаты'}).click();
    await expect(page.locator('#results-dialog')).toBeVisible();
    await page.screenshot({path:`artifacts/progress-${width}.png`,fullPage:true});
  });
}
