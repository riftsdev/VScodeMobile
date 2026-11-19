import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
test.beforeEach(async({page})=>{
  await page.goto('./');
  await expect(page.locator('#breadcrumb')).toHaveText('Meu-site/index.html');
  await expect(page.locator('.CodeMirror')).toBeVisible();
});
test('selected folder runs its modules, CSS and fetch without mixing projects',async({page})=>{
  await page.locator('.top-actions [data-action="run"]').click();
  const frame=page.frameLocator('#preview');
  await expect(frame.locator('#count')).toContainText('0');
  await frame.locator('#count').click();await expect(frame.locator('#count')).toContainText('1');
  await expect(page.locator('#logs')).toContainText('JSON local carregado');
  await page.locator('#run-root').selectOption('Outro-projeto');
  await page.locator('.top-actions [data-action="run"]').click();
  await expect(frame.locator('h1')).toHaveText('Outro projeto');
  await expect(frame.locator('body')).toHaveCSS('background-color','rgb(245, 237, 220)');
  await expect(frame.locator('#count')).toHaveCount(0);
  await expect(page.locator('#save-status')).toContainText('Salvo');
  await page.reload();await expect(page.locator('#run-root')).toHaveValue('Outro-projeto');
});
test('editor persists Unicode changes',async({page})=>{
  await page.evaluate(()=>{const cm=document.querySelector('.CodeMirror').CodeMirror;cm.setValue('<h1>Persistência ç 🚀</h1>');});
  await expect(page.locator('#save-status')).toContainText('Salvo');
  await page.reload();await expect(page.locator('.CodeMirror')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue())).toContain('Persistência ç 🚀');
});
test('sandbox cannot read parent storage and captures errors',async({page})=>{
  await page.evaluate(async()=>{
    const {buildPreview}=await import('./src/preview.js');
    const state={root:'demo',files:{'demo/index.html':{type:'text',content:'<script>try{parent.document.body.dataset.compromised="yes"}catch(e){console.log("isolado")}throw Error("erro-teste")</script>'}}};
    const {html}=await buildPreview(state,'demo/index.html','test');
    window.__messages=[];addEventListener('message',e=>{if(e.data.kg==='test')window.__messages.push(e.data);});
    document.querySelector('#preview').srcdoc=html;
  });
  await expect.poll(()=>page.evaluate(()=>window.__messages.some(m=>m.data?.text==='isolado'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__messages.some(m=>m.data?.text?.includes('erro-teste')))).toBe(true);
  expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
});
test('nested CSS, images, circular modules, dynamic literal imports and fetch',async({page})=>{
  await page.evaluate(async()=>{
    const {buildPreview}=await import('./src/preview.js');
    const t=content=>({type:'text',content});
    const files={
      'p/pages/index.html':t('<link rel="stylesheet" href="../css/main.css"><h1 id="answer">aguarde</h1><img id="pic" src="../img/icon.svg"><script type="module" src="../js/main.js"></script>'),
      'p/css/main.css':t('@import "./colors.css"; body{background-image:url("../img/icon.svg")}'),
      'p/css/colors.css':t('h1{color:rgb(1, 2, 3)}'),
      'p/img/icon.svg':t('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'),
      'p/data.json':t('{"value":7}'),
      'p/js/main.js':t("import {get} from './a.js'; const m=await import('./other.js');const data=await fetch('../data.json').then(r=>r.json());document.querySelector('#answer').textContent=get()+m.n+data.value;"),
      'p/js/a.js':t("import {read} from './b.js';export const n=2;export function get(){return read()}"),
      'p/js/b.js':t("import {n} from './a.js';export function read(){return n}"),
      'p/js/other.js':t('export const n=3;')
    };
    const result=await buildPreview({root:'p',files},'p/pages/index.html','assets');document.querySelector('#preview').style.display='block';document.querySelector('#preview-empty').hidden=true;document.querySelector('#preview').srcdoc=result.html;
  });
  const frame=page.frameLocator('#preview');await expect(frame.locator('#answer')).toHaveText('12');
  await expect(frame.locator('#answer')).toHaveCSS('color','rgb(1, 2, 3)');
  await expect.poll(()=>frame.locator('#pic').evaluate(img=>img.naturalWidth)).toBe(10);
});
test('ZIP import preserves subdirectories, empty folders and binary bytes',async({page})=>{
  const zip=new JSZip();zip.file('Teste/index.html','<img id="imported" src="assets/a.svg"><h1>ZIP completo</h1>');zip.file('Teste/assets/a.svg','<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');zip.file('Teste/assets/model.glb',new Uint8Array([0,255,7,128,2]));zip.folder('Teste/vazia');
  const buffer=await zip.generateAsync({type:'nodebuffer'});
  await page.setInputFiles('#file-input',{name:'projeto.zip',mimeType:'application/zip',buffer});
  await expect(page.locator('#toast')).toContainText('3 arquivos importados');
  await expect(page.locator('#run-root')).toHaveValue('Teste');
  await page.locator('.top-actions [data-action="run"]').click();
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('ZIP completo');
  const data=await page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('kgcode-workspace',1);req.onsuccess=()=>{const get=req.result.transaction('state').objectStore('state').get('workspace');get.onsuccess=()=>resolve(get.result);get.onerror=reject;};}));
  expect(data.files['Teste/assets/model.glb'].type).toBe('binary');
  expect(Buffer.from(data.files['Teste/assets/model.glb'].content,'base64')).toEqual(Buffer.from([0,255,7,128,2]));
  expect(data.folders).toContain('Teste/vazia');
});
test('missing files and cross-folder references fail clearly',async({page})=>{
  const errors=await page.evaluate(async()=>{
    const {buildPreview}=await import('./src/preview.js');
    const results=[];for(const href of ['missing.css','../Outro-projeto/style.css']){
      try{await buildPreview({root:'one',files:{'one/index.html':{type:'text',content:'<link rel="stylesheet" href="'+href+'">'}}},'one/index.html','missing');}
      catch(e){results.push(e.message);}
    }return results;
  });
  expect(errors[0]).toContain('Arquivo não encontrado');expect(errors[1]).toContain('fora da pasta');
});
test('mobile layout fits viewport and dialogs remain accessible',async({page})=>{
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator('.top-actions [data-action="menu"]').click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Preferências',exact:true}).click();await expect(page.locator('#dialog-title')).toHaveText('Preferências');
  await page.locator('#dialog-close').click();await expect(page.getByRole('dialog')).not.toBeVisible();
});
