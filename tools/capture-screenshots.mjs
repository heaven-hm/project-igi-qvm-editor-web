import {chromium} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.goto(process.env.SCREENSHOT_BASE_URL||'http://127.0.0.1:4176/');
  await page.getByText('Engine ready',{exact:true}).waitFor();
  const screenshots=new URL('../docs/screenshots/',import.meta.url);
  await mkdir(screenshots,{recursive:true});
  await page.getByLabel('Open QSC or QVM file').setInputFiles(new URL('../tests/fixtures/objects.qsc',import.meta.url).pathname);
  await page.getByRole('status').filter({hasText:'Opened objects.qsc'}).waitFor();
  await page.screenshot({path:new URL('editor.png',screenshots).pathname,fullPage:true});
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Compiled successfully'}).waitFor();
  await page.screenshot({path:new URL('compiled-qvm.png',screenshots).pathname,fullPage:true});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QVM',exact:true}).click()]);
  const bytes=await readFile(await download.path());
  await page.getByLabel('Open QSC or QVM file').setInputFiles({name:'objects.qvm',mimeType:'application/octet-stream',buffer:bytes});
  await page.getByRole('status').filter({hasText:'QVM source opened in the editor'}).waitFor();
  await page.getByRole('button',{name:'Decompile to QSC'}).click();
  await page.getByRole('status').filter({hasText:'QVM decompiled'}).waitFor();
  await page.screenshot({path:new URL('decompiled-qsc.png',screenshots).pathname,fullPage:true});
  console.log('Captured editor, compiled QVM and decompiled QSC screenshots.');
}finally{await browser.close();}
