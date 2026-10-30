import {test} from '@playwright/test';
import {checkLongMobileProgram} from './mobile-editor.helpers.js';

for(const [width,height] of [[320,568],[360,740],[390,844]]){
  test(`Long nested mobile program expands and keeps editing visible at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height});
    await checkLongMobileProgram(page);
  });
}
