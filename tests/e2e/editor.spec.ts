import {test, expect, type Page} from '@playwright/test';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
const example = 'Task_New(1, "TestObject", "mission", -1, 3.5, FALSE);\na = 2 + 3 * 4;';
const openFile = (page:Page,name:string,buffer:Buffer) => page.getByLabel('Open QSC or QVM file').setInputFiles({name,mimeType:'application/octet-stream',buffer});
async function shortcut(page:Page,key:string){const mac=await page.evaluate(()=>/Macintosh|iPhone|iPad/.test(navigator.userAgent));await page.keyboard.press(`${mac?'Meta':'Control'}+${key}`);}
test.beforeEach(async ({page,browserName}) => {
  const errors:string[]=[]; const uploads:string[]=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('request', request=>{if(['POST','PUT','PATCH'].includes(request.method())) uploads.push(request.url());});
  (page as any).__errors=errors; (page as any).__uploads=uploads;
  if(browserName==='chromium')await page.coverage.startJSCoverage({resetOnNavigation:false});
  await page.goto('/');
  await expect(page.getByText('Engine ready', {exact:true})).toBeVisible();
  await expect(page.getByRole('textbox', {name:'QSC source editor'})).toBeVisible();
  (page as any).__errors=errors; (page as any).__uploads=uploads;
});
test.afterEach(async ({page,browserName},testInfo)=>{
  if(browserName==='chromium') {
    const coverage=await page.coverage.stopJSCoverage();
    const label=process.env.E2E_RUN_LABEL||(process.env.E2E_BASE_URL?'production':'local');
    const directory=`test-results/coverage-${label}`;
    await mkdir(directory,{recursive:true});
    const application=coverage.filter(item=>/\/src\/|\/assets\/index-/.test(item.url));
    await writeFile(join(directory,`${testInfo.project.name}-${testInfo.testId.replace(/[^a-zA-Z0-9]/g,'_')}.json`),JSON.stringify(application));
  }
  expect((page as any).__errors).toEqual([]);
  expect((page as any).__uploads).toEqual([]);
});
for (const minor of ['5','7']) test(`edit, validate, compile, download and reopen IGI ${minor==='5'?'1':'2'}`,async ({page})=>{
  page.on('dialog', dialog=>dialog.accept());
  await openFile(page,'mission.qsc',Buffer.from(example));
  await expect(page.getByRole('status')).toContainText('Opened mission.qsc');
  await page.getByLabel('Compile target').selectOption(minor);
  await page.getByRole('button',{name:'Validate',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Validation passed');
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download compiled QVM'}).click()]);
  expect(download.suggestedFilename()).toBe('mission.qvm');
  const bytes=await readFile((await download.path())!);
  expect(bytes.subarray(0,4).toString()).toBe('LOOP');
  expect(bytes.readUInt32LE(8)).toBe(Number(minor));
  await openFile(page,'roundtrip.qvm',bytes);
  await expect(page.getByLabel('Compile target')).toHaveValue(minor);
  await expect(page.getByRole('status')).toContainText('Detected IGI');
  await page.getByRole('button',{name:'Decompile to QSC'}).click();
  await expect(page.getByRole('status')).toContainText('QVM decompiled');
  const [sourceDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QSC',exact:true}).click()]);
  const source=await readFile((await sourceDownload.path())!,'utf8');
  expect(source).toContain('Task_New');
  const editor=page.getByRole('textbox',{name:'QSC source editor'});
  await editor.focus();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText('\nFoo(99);');
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
});
test('diagnostics, malformed files, compile invalidation and empty source',async ({page})=>{
  page.on('dialog', dialog=>dialog.accept());
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText('source is empty');
  await openFile(page,'bad.qsc',Buffer.from('Foo(@);'));
  await page.getByRole('button',{name:'Validate',exact:true}).click();
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText(/error|unexpected|invalid/i);
  await openFile(page,'malformed.qvm',Buffer.from('QVM invalid data'));
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toBeVisible();
  await openFile(page,'valid.qsc',Buffer.from(example));
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('button',{name:'Download compiled QVM'})).toBeEnabled();
  await page.getByLabel('Compile target').selectOption('7');
  await expect(page.getByRole('button',{name:'Download compiled QVM'})).toBeDisabled();
});
test('Unicode diagnostic underline matches the offending character and clears after editing',async ({page})=>{
  await openFile(page,'unicode.qsc',Buffer.from('Foo(1);\nFoo("é😀", @);'));
  await page.getByRole('button',{name:'Validate',exact:true}).click();
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText('2:');
  const marker=page.locator('.squiggly-error').first();await expect(marker).toBeVisible();
  const offending=await page.locator('.view-lines').evaluate(element=>{
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null;
    while((node=walker.nextNode())){const index=node.textContent?.indexOf('@')??-1;if(index>=0){const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+1);const bounds=range.getBoundingClientRect();return {x:bounds.x,y:bounds.y};}}return null;
  });
  expect(offending).toBeTruthy();const bounds=await marker.boundingBox();expect(bounds).toBeTruthy();
  expect(Math.abs(bounds!.x-offending!.x)).toBeLessThan(3);
  const editor=page.getByRole('textbox',{name:'QSC source editor'});await editor.focus();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText('Foo(1);');
  await expect(page.locator('.squiggly-error')).toHaveCount(0);
});
test('theme persistence, wrap, find, new document and responsive layout',async ({page})=>{
  await page.getByLabel('Theme',{exact:true}).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();await expect(page.getByText('Engine ready',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Theme',{exact:true})).toHaveValue('light');
  await page.getByLabel('Theme',{exact:true}).selectOption('midnight');
  await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');
  await openFile(page,'source.qsc',Buffer.from(example));
  await page.getByRole('button',{name:'Toggle word wrap'}).click();
  await expect(page.getByRole('button',{name:'Toggle word wrap'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Find in source'}).click();
  await expect(page.locator('.find-widget')).toBeVisible();
  await page.locator('.find-widget input[aria-label="Find"]').fill('Task_New');
  await expect(page.locator('.currentFindMatch')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'New QSC file'}).click();
  await expect(page.getByRole('status')).toContainText('New QSC document');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
test('exact saved source bytes, shortcuts, dirty cancellation, undo and redo',async ({page})=>{
  await openFile(page,'exact.qsc',Buffer.from(example));
  const editor=page.getByRole('textbox',{name:'QSC source editor'});
  await editor.focus();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText(';');
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await shortcut(page,'z');
  const [undoDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QSC',exact:true}).click()]);
  expect(await readFile((await undoDownload.path())!,'utf8')).toBe(example);
  await editor.focus();await shortcut(page,'Shift+z');
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  const cancel=(dialog:any)=>dialog.dismiss();page.on('dialog',cancel);
  await page.getByRole('button',{name:'New QSC file'}).click();
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await openFile(page,'replacement.qsc',Buffer.from('Bar(2);'));
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
  await page.getByRole('button',{name:'Decompile to QSC'}).click();
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  page.off('dialog',cancel);
  const [saved]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('ControlOrMeta+s')]);
  expect(await readFile((await saved.path())!,'utf8')).toBe(example+';');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.keyboard.press('ControlOrMeta+o')]);
  await chooser.setFiles({name:'shortcut.qsc',mimeType:'text/plain',buffer:Buffer.from('Foo(1);')});
  await expect(page.getByRole('status')).toContainText('Opened shortcut.qsc');
});
test('multifile drop rejected and all themes change actual background colors',async ({page})=>{
  const colors:string[]=[],editorColors:string[]=[];
  const backgrounds:Record<string,string>={dark:'rgb(30, 30, 30)',light:'rgb(255, 255, 254)',midnight:'rgb(16, 24, 39)'};
  for(const theme of ['dark','light','midnight']){
    await page.getByLabel('Theme',{exact:true}).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    colors.push(await page.locator('body').evaluate(element=>getComputedStyle(element).backgroundColor));
    await expect.poll(()=>page.locator('.monaco-editor').first().evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(backgrounds[theme]);
    editorColors.push(await page.locator('.monaco-editor').first().evaluate(element=>getComputedStyle(element).backgroundColor));
  }
  expect(new Set(colors).size).toBe(3);
  expect(new Set(editorColors).size).toBe(3);
  await page.locator('.studio').evaluate(element=>{const data=new DataTransfer();data.items.add(new File(['Foo();'],'one.qsc'));data.items.add(new File(['Bar();'],'two.qsc'));element.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText('one QSC or QVM file at a time');
});
test('CRLF documents keep exact line endings through save and edits',async ({page})=>{
  const original='Foo(1);\r\nBar(2);\r\n';await openFile(page,'windows.qsc',Buffer.from(original));
  const [first]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QSC',exact:true}).click()]);
  expect(await readFile((await first.path())!,'utf8')).toBe(original);
  const editor=page.getByRole('textbox',{name:'QSC source editor'});await editor.focus();await shortcut(page,'End');await page.keyboard.insertText('Baz(3);');
  const [second]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QSC',exact:true}).click()]);
  expect(await readFile((await second.path())!,'utf8')).toBe(original+'Baz(3);');
});
test('worker failure exposes retry and recovers when resource becomes available',async ({page})=>{
  // A real network failure exercises the public retry flow without a test-only engine hook.
  await page.route('**/wasm/qvm.wasm',route=>route.abort('failed'));
  await page.reload();
  await expect(page.getByText('Engine unavailable',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Retry engine'})).toBeVisible();
  await page.unroute('**/wasm/qvm.wasm');
  await page.getByRole('button',{name:'Retry engine'}).click();
  await expect(page.getByText('Engine ready',{exact:true})).toBeVisible();
});
test('editing while an asynchronous file read runs preserves newer source',async ({page})=>{
  await openFile(page,'current.qsc',Buffer.from('Foo(1);'));
  // Delay the browser File API rather than introducing any production test hook.
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){await new Promise(resolve=>setTimeout(resolve,700));return original.call(this);};});
  await openFile(page,'stale.qsc',Buffer.from('Bar(2);'));
  const editor=page.getByRole('textbox',{name:'QSC source editor'});await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText('\nBaz(3);');
  await expect(page.getByRole('status')).toContainText('File open cancelled because the source changed');
  const [saved]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save QSC',exact:true}).click()]);
  expect(await readFile((await saved.path())!,'utf8')).toBe('Foo(1);\nBaz(3);');
});
test('editing during a delayed worker compile discards stale output',async ({page})=>{
  await openFile(page,'race.qsc',Buffer.from('Foo(1);'));
  // Introduce transport latency at the browser Worker API, keeping the real engine.
  await page.evaluate(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message:any,...args:any[]){if(message.operation==='compile'){setTimeout(()=>original.call(this,message,...args as [any]),700);}else original.call(this,message,...args as [any]);};});
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'QSC source editor'});await editor.focus();await shortcut(page,'End');await page.keyboard.insertText(';');
  await expect(page.getByRole('status')).toContainText('Source or target changed during the operation');
  await expect(page.getByRole('button',{name:'Download compiled QVM'})).toBeDisabled();
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
});
test('engine initialization timeout is visible and retry recovers',async ({page})=>{
  await page.clock.install();
  let release:(()=>void)|undefined;
  await page.route('**/wasm/qvm.wasm',async route=>{await new Promise<void>(resolve=>{release=resolve;});await route.abort('failed').catch(()=>{});});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByText('Loading engine',{exact:true})).toBeVisible();
  await expect.poll(()=>Boolean(release)).toBe(true);
  await page.clock.fastForward(46000);
  await expect(page.getByText('Engine unavailable',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert').first()).toContainText('timed out');
  release?.();await page.unroute('**/wasm/qvm.wasm');
  await page.getByRole('button',{name:'Retry engine'}).click();
  await expect(page.getByText('Engine ready',{exact:true})).toBeVisible();
});
test('drag and drop source, unsupported and oversized file limits',async ({page})=>{
  await page.locator('.studio').evaluate((element,source)=>{const data=new DataTransfer();data.items.add(new File([source],'dropped.qsc'));element.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));},example);
  await expect(page.getByRole('status')).toContainText('Opened dropped.qsc');
  await openFile(page,'wrong.txt',Buffer.from('test'));
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText('Unsupported file');
  await openFile(page,'huge.qsc',Buffer.alloc(4*1024*1024+1,65));
  await expect(page.getByLabel('Diagnostics').getByRole('alert')).toContainText('too large');
});
test('real local game binary auto-detects, decompiles and recompiles',async ({page})=>{
  page.on('dialog', dialog=>dialog.accept());
  test.skip(!process.env.IGI_GAME_PATH,'Set IGI_GAME_PATH to verify locally owned game files without committing them.');
  async function locate(dir:string):Promise<string|undefined>{for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){const found=await locate(path);if(found)return found;}else if(/^objects\.qvm$/i.test(entry.name))return path;}return undefined;}
  const path=await locate(process.env.IGI_GAME_PATH!);expect(path).toBeTruthy();
  const bytes=await readFile(path!);
  await openFile(page,'objects.qvm',bytes);
  await expect(page.getByRole('status')).toContainText('Detected IGI');
  await expect(page.getByLabel('Compile target')).toHaveValue(String(bytes.readUInt32LE(8)));
  await page.getByRole('button',{name:'Decompile to QSC'}).click();
  await expect(page.getByRole('status')).toContainText('QVM decompiled');
  await page.getByRole('button',{name:'Compile QVM',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compiled successfully');
});
