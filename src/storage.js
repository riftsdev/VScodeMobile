import {freshState,validateState,textFile,normalize} from './core.js';
let db, queue=Promise.resolve();
export async function openStorage() {
  db = await new Promise((resolve,reject)=>{
    const req=indexedDB.open('kgcode-workspace',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('state');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  db.onversionchange=()=>db.close();
  const saved=await read('workspace');
  if(saved) return validateState(saved);
  let old;
  try{old=JSON.parse(localStorage.getItem('kgcode_files')||'null');}catch{}
  if(old && typeof old==='object') {
    const state=freshState(false);
    for(const [name,file] of Object.entries(old)) {
      try {
        const p=normalize(name);if(!p || typeof file.content!=='string')continue;
        if(file.type==='binary' && file.content.startsWith('data:')) {
          if(file.content.includes(';base64,'))state.files[p]={type:'binary',content:file.content.split(',').slice(1).join(',')};
          else state.files[p]=textFile(decodeURIComponent(file.content.slice(file.content.indexOf(',')+1)));
        } else state.files[p]=textFile(file.content);
      }catch{}
    }
    state.current=Object.keys(state.files)[0]||'';state.tabs=state.current?[state.current]:[];
    const verified=validateState(state);await saveState(verified);return verified;
  }
  const state=freshState();await saveState(state);return state;
}
export async function read(key) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readonly');const req=tx.objectStore('state').get(key);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export function saveState(state) {
  const copy=structuredClone(state);copy.updated=Date.now();
  const task=queue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
    if(!db){reject(Error('Armazenamento indisponível. Exporte um backup antes de fechar.'));return;}
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(copy,'workspace');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Não foi possível salvar.'));
  }));
  queue=task;return task;
}
export async function checkpoint(state) {
  const copy=structuredClone(state);
  await queue.catch(()=>{});
  await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(copy,'recovery');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
