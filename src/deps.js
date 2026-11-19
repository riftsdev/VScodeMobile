const pending=new Map();
const CDN='https://cdn.jsdelivr.net/npm/';
export function script(local,remote) {
  if(pending.has(local))return pending.get(local);
  const task=new Promise((resolve,reject)=>{
    const add=(url,fallback)=>{
      const s=document.createElement('script');s.src=url;s.async=false;
      let timer=setTimeout(()=>{s.remove();fallback?add(remote,false):reject(Error('Não foi possível carregar '+local));},12000);
      s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();fallback?add(remote,false):reject(Error('Sem conexão para carregar '+local));};
      document.head.append(s);
    };add('./vendor/'+local,true);
  }).catch(e=>{pending.delete(local);throw e;});
  pending.set(local,task);return task;
}
function css(local,remote) {
  const l=document.createElement('link');l.rel='stylesheet';l.href='./vendor/'+local;l.onerror=()=>{l.onerror=null;l.href=remote;};document.head.append(l);
}
export async function loadEditor() {
  css('codemirror.css',CDN+'codemirror@5.65.16/lib/codemirror.css');
  css('dracula.css',CDN+'codemirror@5.65.16/theme/dracula.css');
  css('eclipse.css',CDN+'codemirror@5.65.16/theme/eclipse.css');
  css('show-hint.css',CDN+'codemirror@5.65.16/addon/hint/show-hint.css');
  await script('codemirror.js',CDN+'codemirror@5.65.16/lib/codemirror.js');
  for(const mode of ['xml','javascript','css','htmlmixed','python','markdown']) await script(mode+'.js',CDN+'codemirror@5.65.16/mode/'+mode+'/'+mode+'.js');
  for(const addon of ['edit/closebrackets','edit/closetag','edit/matchbrackets','search/searchcursor','comment/comment','hint/show-hint','hint/anyword-hint','hint/javascript-hint','hint/xml-hint','hint/html-hint','hint/css-hint']) await script(addon.split('/').pop()+'.js',CDN+'codemirror@5.65.16/addon/'+addon+'.js');
  return window.CodeMirror;
}
export async function zipLibrary() {await script('jszip.js',CDN+'jszip@3.10.1/dist/jszip.min.js');return window.JSZip;}
export async function lexer() {
  let mod;try{mod=await import('../vendor/lexer.js');}catch{mod=await import('https://cdn.jsdelivr.net/npm/es-module-lexer@1.7.0/dist/lexer.js');}
  await mod.init;return mod;
}
export async function formatter() {
  await script('prettier.js',CDN+'prettier@3.6.2/standalone.js');
  for(const p of ['babel','estree','html','postcss','markdown'])await script('prettier-'+p+'.js',CDN+'prettier@3.6.2/plugins/'+p+'.js');
  return window.prettier;
}
