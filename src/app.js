import {normalize,dirname,basename,inside,relative,ext,mode,mime,isText,textFile,bytes,base64,dataURL,directories,assertVacant,movePath,freshState,validateState,MAX_FILE,MAX_IMPORT} from './core.js';
import {openStorage,saveState,checkpoint,read} from './storage.js';
import {loadEditor,zipLibrary,formatter} from './deps.js';
import {buildPreview} from './preview.js';
const $=id=>document.getElementById(id);
let state,cm,storageReady=false,loading=false,dirty=false,saveTimer,saveRevision=0,runTimer,runVersion=0,worker,session=null,token='',importTarget='',importMode='files',assetURL;
const docs=new Map(),folded=new Set();
const mobile=()=>matchMedia('(max-width:1100px)').matches;
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,fn,cls){const b=node('button',text,cls);b.type='button';b.onclick=()=>guard(fn);return b;}
function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5500);}
function log(level,text){const row=node('div',undefined,'log '+level);const time=node('time',new Date().toLocaleTimeString('pt-BR'));row.append(time,document.createTextNode(String(text).slice(0,15000)));$('logs').append(row);while($('logs').children.length>400)$('logs').firstChild.remove();$('log-count').textContent=$('logs').children.length;row.scrollIntoView({block:'nearest'});}
async function guard(fn){try{return await fn();}catch(e){console.error(e);toast(e.message||String(e));log('error',e.message||String(e));}}
function modal(title){$('dialog-title').textContent=title;$('dialog-body').replaceChildren();if(!$('dialog').open)$('dialog').showModal();return $('dialog-body');}
function closeModal(){$('dialog').close();}
function field(parent,label,value='',type='text'){const l=node('label',label);const input=node('input');input.type=type;input.value=value;l.append(input);parent.append(l);return input;}
function selectField(parent,label,options,value){const l=node('label',label),s=node('select');for(const [key,text]of options)s.add(new Option(text,key));s.value=value;l.append(s);parent.append(l);return s;}
function markDirty(){
  dirty=true;saveRevision++;$('save-status').textContent='● Alterações pendentes';
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>guard(flush),500);
}
async function flush(){
  if(!state)return;clearTimeout(saveTimer);const rev=saveRevision;
  if(!storageReady){$('save-status').textContent='⚠ Sem salvamento — exporte backup';throw Error('O armazenamento não foi aberto. Os dados anteriores foram preservados. Exporte o trabalho atual antes de sair.');}
  $('save-status').textContent='Salvando…';
  try{await saveState(state);if(rev===saveRevision){dirty=false;$('save-status').textContent='✓ Salvo neste dispositivo';}}
  catch(e){dirty=true;$('save-status').textContent='⚠ Falha ao salvar — exporte backup';throw e;}
}
function selectedDir(){return Object.hasOwn(state.files,state.selected)?dirname(state.selected):state.selected||'';}
function setRoot(root){
  state.root=root;
  const candidates=Object.keys(state.files).filter(p=>inside(p,root)&&/\.html?$/i.test(p));
  if(!state.files[state.entries[root]]||!inside(state.entries[root],root))state.entries[root]=candidates.find(p=>p===(root?root+'/':'')+'index.html')||candidates[0]||Object.keys(state.files).find(p=>inside(p,root)&&p.endsWith('.py'))||'';
  renderRun();markDirty();
}
function renderRun(){
  const root=$('run-root'),entry=$('run-entry');root.replaceChildren(new Option('Toda a área de trabalho',''));
  for(const d of directories(state))root.add(new Option(d,d));root.value=state.root;
  entry.replaceChildren();
  for(const p of Object.keys(state.files).filter(p=>inside(p,state.root)&&/\.(html?|py)$/i.test(p)).sort())entry.add(new Option(relative(p,state.root),p));
  entry.value=state.entries[state.root]||'';if(!entry.value&&entry.options.length){entry.selectedIndex=0;state.entries[state.root]=entry.value;}
  if(!entry.options.length)entry.add(new Option('Crie um index.html nesta pasta',''));
}
function renderTree(){
  const tree=$('tree');tree.replaceChildren();
  const dirs=directories(state),all=[...dirs.map(path=>({path,folder:true})),...Object.keys(state.files).map(path=>({path,folder:false}))];
  const children=new Map();
  for(const item of all){const parent=dirname(item.path);if(!children.has(parent))children.set(parent,[]);children.get(parent).push(item);}
  function append(parent,depth){
    const items=(children.get(parent)||[]).sort((a,b)=>Number(b.folder)-Number(a.folder)||basename(a.path).localeCompare(basename(b.path)));
    for(const item of items){
      const row=node('div',undefined,'tree-row'+(state.selected===item.path?' selected':'')+(state.current===item.path?' active':''));
      row.setAttribute('role','treeitem');row.setAttribute('aria-level',depth+1);row.style.paddingLeft=(8+depth*13)+'px';
      if(item.folder)row.setAttribute('aria-expanded',!folded.has(item.path));
      const icon=node('span',item.folder?(folded.has(item.path)?'▸':'▾'):({html:'◇',css:'#',js:'JS',mjs:'JS',py:'Py',json:'{}'}[ext(item.path)]||'·'),'tree-icon '+ext(item.path));
      const name=button(basename(item.path),()=>{state.selected=item.path;if(item.folder){folded.has(item.path)?folded.delete(item.path):folded.add(item.path);renderTree();}else openFile(item.path);},'tree-name');name.title=item.path;
      row.append(icon,name);
      if(item.folder){const run=button('▶',()=>{state.selected=item.path;setRoot(item.path);return runProject();},'tree-run');run.title='Executar '+item.path;row.append(run);}
      const more=button('•••',()=>pathMenu(item.path,item.folder),'tree-more');more.setAttribute('aria-label','Ações de '+item.path);row.append(more);tree.append(row);
      if(item.folder&&!folded.has(item.path))append(item.path,depth+1);
    }
  }append('',0);
  $('file-count').textContent=Object.keys(state.files).length+' arquivos';
}
function renderTabs(){
  $('tabs').replaceChildren();
  for(const path of state.tabs.filter(p=>state.files[p])){
    const tab=node('div',undefined,'tab'+(path===state.current?' active':''));tab.setAttribute('role','tab');tab.setAttribute('aria-selected',path===state.current);
    const name=button(basename(path),()=>openFile(path));name.title=path;
    const close=button('×',()=>{state.tabs=state.tabs.filter(p=>p!==path);if(state.current===path)openFile(state.tabs.at(-1)||'');else renderTabs();markDirty();},'close-tab');close.setAttribute('aria-label','Fechar '+path);
    tab.append(name,close);$('tabs').append(tab);
  }
}
function contentChanged(value){
  if(loading||!state?.current||state.files[state.current]?.type!=='text')return;
  state.files[state.current].content=value;markDirty();
  if(state.settings.autoRun){clearTimeout(runTimer);runTimer=setTimeout(()=>guard(runProject),1100);}
}
function applySettings(){
  document.body.classList.toggle('light',state.settings.theme==='light');
  $('code').style.fontSize=state.settings.fontSize+'px';$('code').style.whiteSpace=state.settings.wrap?'pre-wrap':'pre';
  if(cm){cm.setOption('theme',state.settings.theme==='light'?'eclipse':'dracula');cm.setOption('lineWrapping',state.settings.wrap);cm.getWrapperElement().style.setProperty('font-size',state.settings.fontSize+'px','important');cm.refresh();}
}
async function showAsset(path,file){
  const view=$('asset-view');view.replaceChildren();view.hidden=false;
  if(assetURL)URL.revokeObjectURL(assetURL);
  assetURL=URL.createObjectURL(new Blob([bytes(file)],{type:mime(path)}));
  let media;
  if(mime(path).startsWith('image/')){media=node('img');media.alt=basename(path);}
  else if(mime(path).startsWith('audio/')){media=node('audio');media.controls=true;}
  else if(mime(path).startsWith('video/')){media=node('video');media.controls=true;media.playsInline=true;}
  else if(ext(path)==='glb'){
    media=document.createElement('model-viewer');media.setAttribute('camera-controls','');media.setAttribute('auto-rotate','');
    import('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js').catch(()=>toast('Visualização 3D precisa de internet. O arquivo continua preservado.'));
  }
  if(media){media.src=assetURL;view.append(media);}
  view.append(node('h3',basename(path)),node('p',(bytes(file).length/1024).toFixed(1)+' KB • '+mime(path)),button('Baixar arquivo',exportFile));
}
function openFile(path,line){
  loading=true;
  state.current=path;state.selected=path||state.selected;
  if(path&&!state.tabs.includes(path))state.tabs.push(path);
  const file=state.files[path],text=file?.type==='text';
  $('asset-view').hidden=true;$('code').hidden=!text;
  if(cm)cm.getWrapperElement().style.display=text?'':'none';
  if(text){
    if(cm){if(!docs.has(path))docs.set(path,new window.CodeMirror.Doc(file.content,mode(path)));cm.swapDoc(docs.get(path));if(cm.getValue()!==file.content)cm.setValue(file.content);cm.setOption('mode',mode(path));cm.refresh();if(line)cm.setCursor(line-1,0);}
    else $('code').value=file.content;
  }else if(file)guard(()=>showAsset(path,file));
  else{$('asset-view').hidden=false;$('asset-view').replaceChildren(node('h3','Abra ou crie um arquivo.'),node('p','Seus projetos aparecem no explorador.'));}
  $('breadcrumb').textContent=path||'Área de trabalho';$('language').textContent=path?ext(path).toUpperCase():'Texto';
  loading=false;renderTabs();renderTree();markDirty();
  if(mobile())document.body.classList.add('sidebar-hidden');
}
function pathMenu(path,folder){
  state.selected=path;renderTree();const body=modal(path);
  const actions=[];
  if(folder)actions.push(['▶ Executar esta pasta',()=>{closeModal();setRoot(path);return runProject();}],['＋ Arquivo nesta pasta',()=>newPath(false)],['＋ Subpasta',()=>newPath(true)]);
  else actions.push(['Abrir arquivo',()=>{closeModal();openFile(path);}]);
  actions.push(['Renomear / mover',async()=>{
    const target=prompt('Novo caminho (relativo à área de trabalho):',path);if(target===null)return;
    await checkpoint(state);const next=normalize(target);movePath(state,path,next);
    for(const key of [...docs.keys()])if(inside(key,path)){const doc=docs.get(key);docs.delete(key);docs.set(next+key.slice(path.length),doc);}
    closeModal();render();openFile(state.current);toast('Caminho atualizado. Confira referências nos seus arquivos.');
  }],['Duplicar',async()=>{
    const target=prompt('Caminho da cópia:',path+'-copia');if(!target)return;const dest=normalize(target);assertVacant(state,dest);
    const selectedFiles=Object.entries(state.files).filter(([p])=>inside(p,path));for(const[p]of selectedFiles)assertVacant(state,dest+p.slice(path.length));
    await checkpoint(state);for(const[p,v]of selectedFiles)state.files[dest+p.slice(path.length)]=structuredClone(v);
    if(folder)state.folders.push(...directories(state).filter(p=>inside(p,path)).map(p=>dest+p.slice(path.length)));
    closeModal();render();markDirty();
  }],['Excluir',async()=>{
    if(!confirm('Excluir '+path+(folder?' e todos os arquivos dentro?':'?')))return;
    await checkpoint(state);for(const p of Object.keys(state.files))if(inside(p,path)){delete state.files[p];docs.delete(p);}
    state.folders=state.folders.filter(p=>!inside(p,path));state.tabs=state.tabs.filter(p=>!inside(p,path));
    if(inside(state.root,path))state.root='';
    state.selected=dirname(path);if(inside(state.current,path))state.current=state.tabs[0]||Object.keys(state.files)[0]||'';
    closeModal();render();openFile(state.current);toast('Excluído. A versão anterior está em Recuperar última alteração.');
  }]);
  for(const[label,fn]of actions)body.append(button(label,fn,'menu-item'+(label==='Excluir'?' danger':'')));
}
async function newPath(folder){
  const base=selectedDir(),name=prompt(folder?'Nome da pasta:':'Nome do arquivo (ex.: index.html):',folder?'nova-pasta':'index.html');
  if(!name)return;const path=normalize((base?base+'/':'')+name);assertVacant(state,path);
  if(folder){state.folders.push(path);state.selected=path;}else state.files[path]=textFile('');
  closeModal();render();markDirty();if(!folder)openFile(path);else toast('Pasta criada. Adicione um index.html e toque no ▶ ao lado dela.');
}
function newProject(){
  const name=prompt('Nome do novo projeto:','Meu-projeto');if(!name)return;const root=normalize(name);assertVacant(state,root);
  const sample=freshState();for(const[p,v]of Object.entries(sample.files))if(inside(p,'Meu-site'))state.files[root+'/'+relative(p,'Meu-site')]=structuredClone(v);
  state.folders.push(root,root+'/css',root+'/js');state.selected=root;setRoot(root);closeModal();render();openFile(root+'/index.html');
}
function render(){renderTree();renderTabs();renderRun();}
function showPanel(which){
  document.body.classList.remove('output-hidden');
  $('preview-panel').hidden=which!=='preview';$('console-panel').hidden=which!=='console';
  document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===which));
}
function stop(){runVersion++;clearTimeout(runTimer);worker?.terminate();worker=null;session=null;$('preview').srcdoc='';$('preview').style.display='none';$('preview-empty').hidden=false;$('run-label').textContent='Execução parada';}
async function runProject(){
  const entry=$('run-entry').value;if(!entry)throw Error('Esta pasta precisa de um arquivo .html ou .py. Crie index.html ou escolha outra pasta.');
  const id=++runVersion;worker?.terminate();worker=null;
  session=null;$('run-label').textContent='Preparando…';document.body.classList.remove('sidebar-open');if(mobile())document.body.classList.add('sidebar-hidden');
  state.entries[state.root]=entry;markDirty();
  if(entry.endsWith('.py')){
    $('preview').srcdoc='';showPanel('console');log('info','Carregando Python em segundo plano…');
    const files=Object.fromEntries(Object.entries(state.files).filter(([p,f])=>inside(p,state.root)&&f.type==='text').map(([p,f])=>[relative(p,state.root),f.content]));
    worker=new Worker(new URL('./python-worker.js',import.meta.url));worker.onmessage=e=>{if(id===runVersion)log(e.data.level,e.data.text);};worker.onerror=e=>log('error',e.message);
    worker.postMessage({files,entry:relative(entry,state.root)});$('run-label').textContent=relative(entry,state.root);return;
  }
  showPanel('preview');const snapshot=structuredClone(state),nonce=crypto.randomUUID();
  try{
    const result=await buildPreview(snapshot,entry,nonce);if(id!==runVersion)return;
    session={token:nonce,root:snapshot.root,entry};
    $('preview').srcdoc=result.html;$('preview').style.display='block';$('preview-empty').hidden=true;$('run-label').textContent=(snapshot.root||'Workspace')+' / '+relative(entry,snapshot.root);
    result.warnings.forEach(w=>log('warn',w));log('info','Executando '+entry);
  }catch(e){if(id===runVersion){session=null;$('preview').srcdoc='';$('preview').style.display='none';$('preview-empty').hidden=false;$('run-label').textContent='Falha na execução';}throw e;}
}
addEventListener('message',e=>{
  if(!session||e.source!==$('preview').contentWindow||e.data?.kg!==session.token)return;
  const {kind,data}=e.data;
  if(kind==='console'&&data&&['log','info','warn','error','debug'].includes(data.level))log(data.level,String(data.text));
  if(kind==='navigate')guard(async()=>{const path=normalize((session.root?session.root+'/':'')+String(data));if(!inside(path,session.root)||!state.files[path]||!/\.html?$/i.test(path))throw Error('Página não encontrada.');state.root=session.root;state.entries[state.root]=path;renderRun();await runProject();});
  if(kind==='storage'&&data&&typeof data==='object'&&!Array.isArray(data)&&JSON.stringify(data).length<=500000){
    if(Object.values(data).every(v=>typeof v==='string')){state.previewStorage??={};Object.defineProperty(state.previewStorage,session.root,{value:data,writable:true,configurable:true,enumerable:true});markDirty();}
  }
});
async function format(){
  const path=state.current,file=state.files[path];if(file?.type!=='text')return;
  const parser={js:'babel',mjs:'babel',json:'json',css:'css',html:'html',htm:'html',md:'markdown'}[ext(path)];
  if(!parser)throw Error('Formatação disponível para HTML, CSS, JavaScript, JSON e Markdown.');
  toast('Carregando formatador…');const prettier=await formatter();
  const original=file.content,result=await prettier.format(original,{parser,plugins:Object.values(window.prettierPlugins),tabWidth:2});
  if(state.files[path]?.content!==original)throw Error('O arquivo mudou durante a formatação. Tente novamente.');
  state.files[path].content=result;if(cm&&state.current===path)cm.replaceRange(result,{line:0,ch:0},cm.posFromIndex(cm.getValue().length));else if(state.current===path)$('code').value=result;
  else docs.delete(path);markDirty();toast('Código formatado.');
}
function search(){
  const body=modal('Buscar no projeto'),find=field(body,'Localizar'),replace=field(body,'Substituir por');
  const scope=selectField(body,'Escopo', [['project','Pasta em execução'],['file','Arquivo atual'],['all','Toda a área de trabalho']],'project');
  const options=node('label');const caseSensitive=node('input');caseSensitive.type='checkbox';options.append(caseSensitive,document.createTextNode(' Diferenciar maiúsculas e minúsculas'));body.append(options);
  const row=node('div',undefined,'row'),results=node('div',undefined,'results');body.append(row,results);
  const paths=()=>Object.keys(state.files).filter(p=>state.files[p].type==='text'&&(scope.value==='all'||scope.value==='file'&&p===state.current||scope.value==='project'&&inside(p,state.root)));
  function matches(source,query){const a=caseSensitive.checked?source:source.toLowerCase(),b=caseSensitive.checked?query:query.toLowerCase();return a.includes(b);}
  function update(){
    results.replaceChildren();if(!find.value)return;let count=0;
    for(const p of paths())for(const [i,line]of state.files[p].content.split('\n').entries())if(matches(line,find.value)){count++;if(count<=200){const result=button('',()=>{closeModal();openFile(p,i+1);},'result');result.append(node('strong',p+':'+(i+1)),node('span',line));results.append(result);}}
    results.prepend(node('p',count+' linhas encontradas'+(count>200?' • exibindo as primeiras 200':'')));
  }
  find.oninput=update;scope.onchange=update;caseSensitive.onchange=update;
  row.append(button('Substituir tudo',async()=>{
    if(!find.value)return;const targets=paths().filter(p=>matches(state.files[p].content,find.value));
    if(!targets.length){toast('Nenhum resultado.');return;}
    if(!confirm('Substituir em '+targets.length+' arquivo(s)?'))return;
    await checkpoint(state);
    const escaped=find.value.replace(/[.*+?^$()|[\]\\]/g,'\\$&'),regex=new RegExp(escaped,caseSensitive.checked?'g':'gi');
    for(const p of targets){state.files[p].content=state.files[p].content.replace(regex,()=>replace.value);docs.delete(p);}
    openFile(state.current);update();markDirty();toast('Substituições concluídas.');
  },'primary'));setTimeout(()=>find.focus(),30);
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function exportFile(){const p=state.current;if(!state.files[p])throw Error('Abra um arquivo primeiro.');download(new Blob([bytes(state.files[p])],{type:mime(p)}),basename(p));}
async function exportZip(all=false){
  const JSZip=await zipLibrary(),zip=new JSZip(),root=all?'':state.root;
  for(const[p,file]of Object.entries(state.files))if(inside(p,root))zip.file(relative(p,root),bytes(file));
  for(const dir of directories(state))if(inside(dir,root)&&dir!==root)zip.folder(relative(dir,root));
  download(await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}}),(root?basename(root):'kgcode-workspace')+'.zip');
  toast('ZIP pronto para salvar em Arquivos.');
}
function backup(){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'kgcode-backup.json');}
function importDialog(){
  const body=modal('Importar arquivos');
  body.append(node('p','Os arquivos entram na pasta abaixo. ZIP preserva subpastas, imagens, áudio e modelos 3D.'));
  const target=field(body,'Pasta de destino (vazio = raiz)',selectedDir());
  body.append(button('Escolher arquivos ou ZIP',()=>{importTarget=normalize(target.value);importMode='files';closeModal();$('file-input').accept='';$('file-input').click();},'menu-item'));
  body.append(button('Escolher pasta completa',()=>{importTarget=normalize(target.value);importMode='files';closeModal();$('folder-input').click();},'menu-item'));
  body.append(node('p','No iPhone, se o seletor não permitir pastas, compacte a pasta no app Arquivos e importe o ZIP. Limites: 10 MB por arquivo, 50 MB por importação.'));
}
async function importFiles(list){
  if(!list.length)return;
  if(importMode==='backup'){
    const value=validateState(JSON.parse(await list[0].text()));
    if(!confirm('Restaurar este backup e substituir a área de trabalho atual?'))return;
    await checkpoint(state);stop();state=value;docs.clear();applySettings();render();openFile(state.current);await flush();toast('Backup restaurado.');return;
  }
  const incoming={},folders=[];let total=0,count=0;
  const ingest=(name,data,dir=false)=>{
    if(name.startsWith('/')||name.split(/[\\/]/).includes('..'))throw Error('Caminho inseguro no arquivo: '+name);
    const path=normalize((importTarget?importTarget+'/':'')+name);if(!path)return;
    if(dir){folders.push(path);return;}
    if(++count>1000||data.length>MAX_FILE||(total+=data.length)>MAX_IMPORT)throw Error('Importação excede os limites. Divida o projeto em partes.');
    incoming[path]=isText(path)?textFile(new TextDecoder('utf-8',{fatal:true}).decode(data)):{type:'binary',content:base64(data)};
  };
  for(const file of list){
    if(file.size>MAX_IMPORT)throw Error('Arquivo maior que 50 MB: '+file.name);
    if(/\.zip$/i.test(file.name)){
      const JSZip=await zipLibrary(),zip=await JSZip.loadAsync(file);
      if(Object.keys(zip.files).length>2000)throw Error('ZIP com entradas demais.');
      let declared=0;
      for(const entry of Object.values(zip.files)){
        const size=entry._data?.uncompressedSize||0;declared+=size;
        if(size>MAX_FILE||declared>MAX_IMPORT)throw Error('ZIP expandido acima do limite permitido.');
        if(entry.unsafeOriginalName?.split(/[\\/]/).includes('..'))throw Error('ZIP contém caminho fora da pasta.');
      }
      for(const entry of Object.values(zip.files))ingest(entry.name,entry.dir?new Uint8Array():await entry.async('uint8array'),entry.dir);
    }else ingest(file.webkitRelativePath||file.name,new Uint8Array(await file.arrayBuffer()));
  }
  const next=structuredClone(state);
  const conflicts=Object.keys(incoming).filter(p=>Object.hasOwn(state.files,p));
  if(conflicts.length&&!confirm('Substituir '+conflicts.length+' arquivo(s) com o mesmo caminho?'))return;
  for(const p of Object.keys(incoming))if(!Object.hasOwn(state.files,p))assertVacant(state,p);
  Object.assign(next.files,incoming);next.folders=[...new Set([...next.folders,...folders])];
  validateState(next);await checkpoint(state);
  state=next;for(const p of Object.keys(incoming))docs.delete(p);
  render();const first=Object.keys(incoming).find(p=>p.endsWith('index.html'))||Object.keys(incoming)[0];
  if(first){openFile(first);if(first.endsWith('.html'))setRoot(dirname(first));}
  await flush();toast(count+' arquivos importados.');
}
function settings(){
  const body=modal('Preferências');
  const theme=selectField(body,'Tema',[['dark','Escuro'],['light','Claro']],state.settings.theme);
  const size=selectField(body,'Fonte do editor',[['12','12 px'],['14','14 px'],['16','16 px'],['18','18 px'],['20','20 px']],String(state.settings.fontSize));
  const wrap=selectField(body,'Quebra de linha',[['true','Ligada'],['false','Desligada']],String(state.settings.wrap));
  const auto=selectField(body,'Executar após editar',[['false','Manual'],['true','Automático após 1,1 segundo']],String(state.settings.autoRun));
  for(const input of [theme,size,wrap,auto])input.onchange=()=>{state.settings={theme:theme.value,fontSize:Number(size.value),wrap:wrap.value==='true',autoRun:auto.value==='true'};applySettings();markDirty();};
  body.append(button('Tentar manter armazenamento persistente',async()=>{const ok=await navigator.storage?.persist?.();toast(ok?'Armazenamento persistente concedido.':'O navegador gerencia esta permissão. Mantenha backups ZIP/JSON.');},'menu-item'));
  body.append(node('p','Os projetos ficam neste navegador. Apagar dados do Safari pode removê-los. Exporte backups. Recursos de servidor, Node.js, npm e extensões de VS Code exigem um ambiente externo.'));
}
function menu(){
  const body=modal('Ferramentas');
  const items=[['Novo projeto',newProject],['Importar arquivos / pasta / ZIP',importDialog],['Exportar pasta em execução (ZIP)',()=>exportZip()],['Exportar toda a área de trabalho (ZIP)',()=>exportZip(true)],['Baixar arquivo aberto',exportFile],['Backup completo (JSON)',backup],['Restaurar backup JSON',()=>{importMode='backup';$('file-input').accept='.json';closeModal();$('file-input').click();}],['Recuperar última alteração estrutural',async()=>{const old=await read('recovery');if(!old)throw Error('Nenhuma cópia de recuperação disponível.');if(!confirm('Restaurar a cópia anterior à última exclusão, importação ou substituição?'))return;const restored=validateState(old);await checkpoint(state);stop();state=restored;docs.clear();closeModal();applySettings();render();openFile(state.current);await flush();}],['Formatar código',format],['Buscar e substituir',search],['GitHub',githubDialog],['Preferências',settings],['Como usar / IPA',help]];
  for(const[label,fn]of items)body.append(button(label,fn,'menu-item'));
}
function help(){
  const body=modal('KG Code 2.0');
  for(const text of ['Crie um projeto para começar com HTML, CSS e JavaScript separados. Cada pasta tem seu próprio botão ▶ e arquivo de entrada. A pasta selecionada é a raiz da execução: caminhos como /style.css partem dela.','Importe ZIP no iPhone para preservar as pastas. Exporte ZIP para compartilhar o código e JSON para um backup completo do editor.','Atalhos: Ctrl/⌘ S salvar, Ctrl/⌘ K comandos, Ctrl/⌘ P arquivos, Ctrl/⌘ Shift F busca, Ctrl/⌘ Enter executar, Ctrl/⌘ / comentar. Esc fecha tela cheia.','A prévia suporta HTML, CSS, JS clássico, módulos ES com imports locais literais, fetch local, imagens e localStorage básico por projeto. Node, PHP, bancos de dados, JSX/TypeScript sem compilação e extensões de VS Code não executam neste navegador.','Python usa Pyodide em um worker e precisa de internet no primeiro carregamento. O botão Parar termina o worker.','A configuração Capacitor e o guia de iOS estão no repositório. Um IPA instalável exige compilação no macOS/Xcode e assinatura Apple. Esta versão não gera nem assina IPA no iPhone.'])body.append(node('p',text));
  const a=node('a','Abrir repositório e documentação');a.href='https://github.com/riftsdev/VScodeMobile';a.target='_blank';a.rel='noopener noreferrer';body.append(a);
}
function commands(filesOnly=false){
  const body=modal(filesOnly?'Abrir arquivo':'Paleta de comandos'),query=field(body,'Digite para filtrar'),results=node('div',undefined,'results');body.append(results);
  const items=filesOnly?Object.keys(state.files).map(p=>[p,()=>{closeModal();openFile(p);}]):[['Executar projeto',()=>{closeModal();return runProject();}],['Novo projeto',newProject],['Novo arquivo',()=>newPath(false)],['Nova pasta',()=>newPath(true)],['Buscar no projeto',search],['Formatar código',format],['Importar',importDialog],['Exportar ZIP',()=>exportZip()],['Salvar',flush],['GitHub',githubDialog],['Preferências',settings],['Modo foco',()=>{closeModal();document.body.classList.toggle('focus');cm?.refresh();}]];
  const update=()=>{results.replaceChildren();for(const [label,fn]of items.filter(([text])=>text.toLowerCase().includes(query.value.toLowerCase())).slice(0,100))results.append(button(label,fn,'menu-item'));};
  query.oninput=update;query.onkeydown=e=>{if(e.key==='Enter')results.querySelector('button')?.click();};update();setTimeout(()=>query.focus(),20);
}
function edit(action,symbol){
  if(state.files[state.current]?.type!=='text')return;
  if(cm){if(symbol!==undefined)cm.replaceSelection(symbol);else if(action==='tab')cm.replaceSelection('  ');else if(action==='left')cm.execCommand('goCharLeft');else if(action==='right')cm.execCommand('goCharRight');else cm.execCommand(action);cm.focus();return;}
  const t=$('code');if(symbol!==undefined||action==='tab'){t.setRangeText(symbol??'  ',t.selectionStart,t.selectionEnd,'end');contentChanged(t.value);}
  else if(action==='selectAll')t.select();else if(action==='left'||action==='right'){const p=Math.max(0,t.selectionStart+(action==='left'?-1:1));t.setSelectionRange(p,p);}
  else toast('Desfazer/refazer avançado estará disponível quando o editor carregar.');t.focus();
}
const actions={sidebar:()=>{document.body.classList.toggle('sidebar-hidden');cm?.refresh();},run:runProject,save:flush,'new-project':newProject,'new-file':()=>newPath(false),'new-folder':()=>newPath(true),import:importDialog,export:()=>exportZip(),format,search,settings,github:githubDialog,menu,commands:()=>commands(),focus:()=>{document.body.classList.toggle('focus');cm?.refresh();},fullscreen:()=>{document.body.classList.toggle('preview-full');showPanel('preview');},'toggle-output':()=>{document.body.classList.toggle('output-hidden');cm?.refresh();},console:()=>showPanel('console'),'clear-console':()=>{$('logs').replaceChildren();$('log-count').textContent='0';},'set-root':()=>setRoot(selectedDir()),stop};
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action&&state)guard(actions[action]);const panel=e.target.closest('[data-panel]')?.dataset.panel;if(panel)showPanel(panel);});
$('symbols').addEventListener('pointerdown',e=>{if(e.target.closest('[data-edit],[data-symbol]'))e.preventDefault();});
$('symbols').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.edit)edit(b.dataset.edit);if(b?.hasAttribute('data-symbol'))edit(null,b.dataset.symbol);});
$('dialog-close').onclick=closeModal;
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('code').oninput=()=>contentChanged($('code').value);
$('code').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();edit('tab');}};
$('run-root').onchange=e=>setRoot(e.target.value);
$('run-entry').onchange=e=>{state.entries[state.root]=e.target.value;markDirty();};
$('device').onchange=e=>{$('preview').style.width=e.target.value==='auto'?'100%':e.target.value+'px';$('frame-wrap').style.justifyContent=e.target.value==='auto'?'center':'flex-start';};
for(const id of ['file-input','folder-input'])$(id).onchange=async e=>{const list=[...e.target.files];e.target.value='';await guard(()=>importFiles(list));};
document.addEventListener('keydown',e=>{
  if(!state)return;
  if(e.key==='Escape'){document.body.classList.remove('focus','preview-full');cm?.refresh();}
  if(!(e.ctrlKey||e.metaKey))return;
  const key=e.key.toLowerCase();
  if(key==='s'){e.preventDefault();guard(flush);}
  if(key==='k'){e.preventDefault();commands();}
  if(key==='p'){e.preventDefault();commands(true);}
  if(key==='f'&&e.shiftKey){e.preventDefault();search();}
  if(key==='enter'){e.preventDefault();guard(runProject);}
  if(key==='/'&&cm){e.preventDefault();cm.execCommand('toggleComment');}
});
const grip=$('panel-grip');let resizing=false;
grip.onpointerdown=e=>{resizing=true;grip.setPointerCapture(e.pointerId);};
grip.onpointermove=e=>{if(!resizing)return;const area=document.querySelector('.workspace').getBoundingClientRect();if(mobile()){const height=Math.min(80,Math.max(20,(area.bottom-e.clientY)/area.height*100));$('output').style.height=height+'%';document.querySelector('.editor-pane').style.height=(100-height)+'%';}else document.documentElement.style.setProperty('--panel-size',Math.min(70,Math.max(25,(area.right-e.clientX)/area.width*100))+'%');cm?.refresh();};
grip.onpointerup=()=>resizing=false;grip.onpointercancel=()=>resizing=false;
grip.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const size=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-size'))||42;document.documentElement.style.setProperty('--panel-size',Math.min(70,Math.max(25,size+(e.key==='ArrowLeft'?5:-5)))+'%');}};
addEventListener('pagehide',()=>{if(dirty)flush().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)flush().catch(()=>{});});
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
addEventListener('resize',()=>cm?.refresh());
async function initialize(){
  try{state=await openStorage();storageReady=true;}catch(e){state=freshState();toast('Armazenamento indisponível: '+e.message+'. Exporte seus arquivos antes de sair.');}
  try{localStorage.removeItem('kgcode_gh_token');}catch{}
  if(mobile())document.body.classList.add('sidebar-hidden');
  applySettings();render();openFile(state.current);guard(flush);
  loadEditor().then(CodeMirror=>{
    cm=CodeMirror.fromTextArea($('code'),{lineNumbers:true,theme:'dracula',mode:mode(state.current),viewportMargin:10,inputStyle:'contenteditable',lineWrapping:state.settings.wrap,autoCloseBrackets:true,autoCloseTags:true,matchBrackets:true,indentUnit:2,tabSize:2,extraKeys:{Tab:editor=>editor.somethingSelected()?editor.indentSelection('add'):editor.replaceSelection('  '),'Ctrl-Space':editor=>editor.showHint({hint:window.CodeMirror.hint.auto,completeSingle:false})}});
    cm.on('change',()=>contentChanged(cm.getValue()));cm.on('cursorActivity',()=>{const p=cm.getCursor();$('cursor').textContent='Lin '+(p.line+1)+', Col '+(p.ch+1);});
    openFile(state.current);applySettings();
  }).catch(()=>toast('Editor básico ativo. A edição com cores precisa carregar as dependências.'));
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
async function gh(path,method='GET',body){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
  const response=await fetch('https://api.github.com'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('GitHub '+response.status+': '+(result.message||'Falha na solicitação.'));
  return result;
}
function githubDialog(){
  const body=modal('GitHub');
  body.append(node('p','Importe um repositório ou envie a pasta em execução. O token fica somente na memória desta sessão.'));
  const config=state.github||{};
  const owner=field(body,'Usuário / organização',config.owner||'riftsdev'),repo=field(body,'Repositório',config.repo||''),branch=field(body,'Branch',config.branch||'main'),pat=field(body,'Token (opcional para repositório público)',token,'password');
  pat.autocomplete='off';pat.spellcheck=false;
  const message=field(body,'Mensagem do commit','Atualização pelo KG Code');
  const status=node('p'),row=node('div',undefined,'row');body.append(row,status);
  function settings(){
    if(!/^[\w.-]+$/.test(owner.value.trim())||!/^[\w.-]+$/.test(repo.value.trim())||!branch.value.trim())throw Error('Preencha usuário, repositório e branch.');
    token=pat.value.trim();const c={owner:owner.value.trim(),repo:repo.value.trim(),branch:branch.value.trim()};
    state.github=c;markDirty();return c;
  }
  const base=c=>'/repos/'+encodeURIComponent(c.owner)+'/'+encodeURIComponent(c.repo);
  async function busy(fn){row.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}finally{row.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  row.append(button('Importar',()=>busy(async()=>{
    const c=settings(),url=base(c);status.textContent='Lendo árvore de arquivos…';
    const commit=await gh(url+'/commits/'+encodeURIComponent(c.branch)),tree=await gh(url+'/git/trees/'+commit.commit.tree.sha+'?recursive=1');
    if(tree.truncated)throw Error('Árvore muito grande. Importe um ZIP de uma subpasta.');
    const entries=tree.tree.filter(x=>x.type==='blob');
    if(entries.some(x=>x.mode==='120000')||tree.tree.some(x=>x.type==='commit'))throw Error('Este repositório contém links simbólicos ou submódulos. Importe os arquivos resolvidos em ZIP.');
    if(entries.length>1000||entries.some(x=>x.size>MAX_FILE)||entries.reduce((n,x)=>n+x.size,0)>MAX_IMPORT)throw Error('Repositório excede 1.000 arquivos / 50 MB.');
    const dest=normalize(prompt('Importar como uma nova pasta:',c.repo+'-'+Date.now().toString(36))||'');if(!dest)return;assertVacant(state,dest);
    const incoming={};let i=0;
    for(const item of entries){
      const p=normalize(dest+'/'+item.path);status.textContent='Importando '+(++i)+' / '+entries.length;
      const blob=await gh(url+'/git/blobs/'+item.sha),encoded=blob.content.replace(/\s/g,'');if(blob.encoding!=='base64')throw Error('Codificação não suportada.');
      if(isText(p)){const arr=Uint8Array.from(atob(encoded),v=>v.charCodeAt(0));incoming[p]=textFile(new TextDecoder('utf-8',{fatal:true}).decode(arr));}
      else incoming[p]={type:'binary',content:encoded};
    }
    const next=structuredClone(state);Object.assign(next.files,incoming);next.folders.push(dest);validateState(next);
    await checkpoint(state);state=next;state.githubBases??={};state.githubBases[dest]={...c,sha:commit.sha};
    state.selected=dest;setRoot(dest);render();const p=Object.keys(incoming).find(p=>p.endsWith('/index.html'))||Object.keys(incoming)[0];if(p)openFile(p);await flush();status.textContent='Importado em '+dest;toast('Repositório importado.');
  }),'primary'));
  row.append(button('Enviar commit',()=>busy(async()=>{
    const c=settings();if(!token)throw Error('Informe um token com Contents: Read and write para este repositório.');
    const root=state.root,items=Object.entries(state.files).filter(([p])=>inside(p,root));if(!items.length)throw Error('Pasta vazia.');
    if(!confirm('Enviar '+items.length+' arquivo(s) de "'+(root||'área de trabalho')+'" para '+c.owner+'/'+c.repo+' ('+c.branch+')? Arquivos com o mesmo caminho serão atualizados.'))return;
    const url=base(c),refPath='/git/refs/heads/'+c.branch.split('/').map(encodeURIComponent).join('/');
    const ref=await gh(url+refPath),old=state.githubBases?.[root];
    if(old&&old.owner===c.owner&&old.repo===c.repo&&old.branch===c.branch&&old.sha!==ref.object.sha)throw Error('O GitHub mudou desde sua importação. Importe a versão atual antes de enviar.');
    const commit=await gh(url+'/git/commits/'+ref.object.sha),elements=[];let i=0;
    for(const[p,file]of items){status.textContent='Preparando '+(++i)+' / '+items.length;const blob=await gh(url+'/git/blobs','POST',{content:base64(bytes(file)),encoding:'base64'});elements.push({path:relative(p,root),mode:'100644',type:'blob',sha:blob.sha});}
    const tree=await gh(url+'/git/trees','POST',{base_tree:commit.tree.sha,tree:elements});
    const next=await gh(url+'/git/commits','POST',{message:message.value.trim()||'Atualização pelo KG Code',tree:tree.sha,parents:[ref.object.sha]});
    const latest=await gh(url+refPath);if(latest.object.sha!==ref.object.sha)throw Error('A branch mudou durante o envio. Nada foi sobrescrito. Importe a versão atual.');
    await gh(url+refPath,'PATCH',{sha:next.sha,force:false});
    state.githubBases??={};state.githubBases[root]={...c,sha:next.sha};markDirty();status.textContent='Commit criado: '+next.sha.slice(0,7);toast('Commit enviado.');
  })));
  body.append(button('Esquecer token desta sessão',()=>{token='';pat.value='';toast('Token removido da memória.');},'menu-item'));
  body.append(node('p','Envio cria um único commit e preserva arquivos remotos que não estão nesta pasta. Exclusões locais não apagam arquivos remotos. Repositórios vazios precisam de um primeiro commit. Não há login Google simulado.'));
}
initialize();
