import {relative,inside,resolveLocal,dataURL,textFile,mime} from './core.js';
import {lexer} from './deps.js';
const ORIGIN='https://kg-project.invalid';
const virtual=path=>ORIGIN+'/'+path.split('/').map(encodeURIComponent).join('/');
const serialize=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
function runtime(config) {
  const nativeFetch=window.fetch.bind(window),NativeURL=window.URL,base=config.base;
  const send=(kind,data)=>parent.postMessage({kg:config.token,kind,data},'*');
  const stringify=value=>{try{return typeof value==='string'?value:JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}catch{return String(value);}};
  let logBudget=0;setInterval(()=>logBudget=0,1000);
  for(const level of ['log','info','warn','error','debug']){const original=console[level].bind(console);console[level]=(...args)=>{if(logBudget++<100)send('console',{level,text:args.map(stringify).join(' ').slice(0,12000)});original(...args);};}
  addEventListener('error',e=>{
    if(e.target!==window){console.error('Recurso não carregado:',e.target.getAttribute?.('src')||e.target.getAttribute?.('href')||e.target.tagName);return;}
    console.error(e.message+' • linha '+e.lineno+':'+e.colno);
  },true);
  addEventListener('unhandledrejection',e=>console.error(e.reason?.stack||e.reason?.message||e.reason));
  function lookup(value,from=base) {
    try {const u=new NativeURL(String(value),from);if(u.origin!==config.origin)return null;return {path:decodeURIComponent(u.pathname.slice(1)),url:u};}catch{return null;}
  }
  function asset(value,from=base) {
    const found=lookup(value,from);
    if(!found)return String(value);
    const result=config.assets[found.path];
    if(!result)throw Error('Arquivo local não encontrado: '+found.path);
    return result+(found.url.hash||'');
  }
  window.KG=Object.freeze({asset,project:config.root});
  window.fetch=async(input,options)=>{
    const raw=input instanceof Request?input.url:String(input);
    const found=lookup(raw);
    if(!found)return nativeFetch(input,options);
    if((options?.method||input?.method||'GET').toUpperCase()!=='GET')return new Response('Prévia local aceita apenas GET.',{status:405});
    const url=config.assets[found.path];
    if(!url){console.error('404: '+found.path);return new Response('Arquivo não encontrado: '+found.path,{status:404});}
    return nativeFetch(url,options);
  };
  window.URL=class extends NativeURL {
    constructor(url,from){super(url,from);if(this.origin===config.origin&&config.assets[decodeURIComponent(this.pathname.slice(1))])return new NativeURL(asset(this.href));}
  };
  try {
    let values={...config.storage};
    const notify=()=>send('storage',values);
    const local={get length(){return Object.keys(values).length;},key:i=>Object.keys(values)[i]??null,getItem:k=>Object.hasOwn(values,String(k))?values[String(k)]:null,setItem:(k,v)=>{const next={...values,[String(k)]:String(v)};if(JSON.stringify(next).length>500000)throw new DOMException('Limite de 500 KB da prévia.','QuotaExceededError');values=next;notify();},removeItem:k=>{delete values[String(k)];notify();},clear:()=>{values={};notify();}};
    Object.defineProperty(window,'localStorage',{value:local});
  }catch{}
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a');if(!a)return;
    const href=a.getAttribute('href');if(!href||href.startsWith('#')||a.hasAttribute('download'))return;
    const found=lookup(href);
    if(found && /\.html?$/i.test(found.path)){e.preventDefault();send('navigate',found.path);}
    else if(found&&!config.assets[found.path]){e.preventDefault();console.error('Link local não encontrado: '+found.path);}
  });
  send('ready',{});
}
export async function buildPreview(state,entry,token) {
  const root=state.root;
  if(!inside(entry,root)||!state.files[entry])throw Error('Selecione um arquivo de entrada desta pasta.');
  const files=Object.fromEntries(Object.entries(state.files).filter(([p])=>inside(p,root)).map(([p,f])=>[relative(p,root),f]));
  const entryPath=relative(entry,root),warnings=[],assets=Object.create(null);
  for(const [p,file]of Object.entries(files))assets[p]=dataURL(file,p);
  function local(ref,from){const p=resolveLocal(ref,from,'');if(p!==null&&!files[p])throw Error('Arquivo não encontrado: '+ref+' (referenciado em '+from+')');return p;}
  const cssCache=new Map();
  function cssText(code,from,chain=[]) {
    const cssRef=ref=>{
      const p=local(ref,from);if(p===null)return ref;
      if(p.endsWith('.css')){
        if(chain.includes(p))throw Error('Importação CSS circular: '+[...chain,p].join(' → '));
        if(!cssCache.has(p))cssCache.set(p,dataURL(textFile(cssText(files[p].content,p,[...chain,p])),p));
        return cssCache.get(p);
      }
      return assets[p]+(ref.includes('#')?'#'+ref.split('#').slice(1).join('#'):'');
    };
    code=code.replace(/@import\s+(["'])([^"']+)\1/g,(_,q,r)=>'@import url("'+cssRef(r)+'")');
    return code.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*?))\s*\)/gi,(_,q,quoted,plain)=>'url("'+cssRef((quoted??plain).trim())+'")');
  }
  const doc=new DOMParser().parseFromString(files[entryPath].content,'text/html');
  for(const el of doc.querySelectorAll('base'))el.remove();
  for(const el of doc.querySelectorAll('meta[http-equiv]'))if(/content-security-policy|refresh/i.test(el.httpEquiv))el.remove();
  const imports={},scopes={};
  for(const tag of doc.querySelectorAll('script[type="importmap"]')){
    const map=JSON.parse(tag.textContent||'{}');Object.assign(imports,map.imports||{});Object.assign(scopes,map.scopes||{});tag.remove();
  }
  const moduleSources=new Map(),compiled=new Map();
  const moduleKey=p=>virtual(p);
  let parser;
  const register=(p)=>{if(!moduleSources.has(p))moduleSources.set(p,files[p].content);return moduleKey(p);};
  for(const [name,target]of Object.entries(imports)) {
    if(typeof target!=='string')continue;
    const p=local(target,entryPath);if(p!==null)imports[name]=register(p);
  }
  for(const tag of doc.querySelectorAll('link[href]')){
    const ref=tag.getAttribute('href'),p=local(ref,entryPath);
    if(p===null)continue;
    if(tag.rel==='stylesheet')tag.href=dataURL(textFile(cssText(files[p].content,p,[p])),p);
    else if(tag.rel==='modulepreload'){tag.remove();}
    else tag.href=assets[p];
  }
  for(const tag of doc.querySelectorAll('style'))tag.textContent=cssText(tag.textContent,entryPath);
  for(const tag of doc.querySelectorAll('[style]'))tag.setAttribute('style',cssText(tag.getAttribute('style'),entryPath));
  for(const tag of doc.querySelectorAll('[src],[poster],[data]')){
    if(tag.tagName==='SCRIPT')continue;
    for(const attr of ['src','poster','data']){
      if(!tag.hasAttribute(attr))continue;
      const ref=tag.getAttribute(attr),p=local(ref,entryPath);
      if(p!==null)tag.setAttribute(attr,assets[p]);
    }
  }
  for(const tag of doc.querySelectorAll('[srcset]')){
    const value=tag.getAttribute('srcset');
    if(value.trim().startsWith('data:')){warnings.push('srcset com data URL mantido sem alterações.');continue;}
    tag.setAttribute('srcset',value.split(',').map(part=>{const [ref,...size]=part.trim().split(/\s+/);const p=local(ref,entryPath);return (p===null?ref:assets[p])+(size.length?' '+size.join(' '):'');}).join(', '));
  }
  let inline=0;
  for(const tag of doc.querySelectorAll('script')){
    const type=(tag.getAttribute('type')||'').trim();
    if(type && !['module','text/javascript','application/javascript'].includes(type))continue;
    const ref=tag.getAttribute('src');
    if(type==='module'){
      if(ref){const p=local(ref,entryPath);if(p!==null){tag.removeAttribute('src');tag.textContent='import '+JSON.stringify(register(p))+';';}}
      else {const p=entryPath+'.inline-'+(++inline)+'.js';moduleSources.set(p,tag.textContent);tag.textContent='import '+JSON.stringify(moduleKey(p))+';';}
    }else if(ref){const p=local(ref,entryPath);if(p!==null){tag.src=assets[p];tag.removeAttribute('integrity');tag.removeAttribute('crossorigin');}}
  }
  if(moduleSources.size)parser=(await lexer()).parse;
  for(const [path,source]of moduleSources){
    const from=path.includes('.inline-')?entryPath:path;
    const [refs]=parser(source);const edits=[];
    for(const ref of refs){
      if(ref.d===-2){edits.push({s:ref.s,e:ref.e,text:'({url:'+JSON.stringify(virtual(from))+'})'});continue;}
      if(ref.n===undefined){warnings.push('import() com caminho calculado pode exigir URL absoluta ou import map.');continue;}
      if(!ref.n.startsWith('.')&&!ref.n.startsWith('/'))continue;
      const target=local(ref.n,from);
      if(target!==null){
        if(!/\.[cm]?js$/i.test(target))throw Error('Import de módulo exige arquivo .js ou .mjs: '+target+'. Para JSON use fetch().');
        const key=register(target);
        edits.push({s:ref.s,e:ref.e,text:ref.d>=0?JSON.stringify(key):key});
      }
    }
    let output=source;for(const edit of edits.sort((a,b)=>b.s-a.s))output=output.slice(0,edit.s)+edit.text+output.slice(edit.e);
    compiled.set(path,dataURL(textFile(output+'\n//# sourceURL='+virtual(from)),path));
  }
  for(const [key,value]of Object.entries(imports))if(value.startsWith(ORIGIN+'/')){const p=decodeURIComponent(value.slice(ORIGIN.length+1));imports[key]=compiled.get(p)||value;}
  for(const [path,url]of compiled)imports[moduleKey(path)]=url;
  const base=doc.createElement('base');base.href=virtual(entryPath);doc.head.prepend(base);
  const bridge=doc.createElement('script');bridge.textContent='('+runtime.toString()+')('+serialize({token,assets,base:virtual(entryPath),origin:ORIGIN,root,storage:state.previewStorage?.[root]||{}})+');';
  const importmap=doc.createElement('script');importmap.type='importmap';importmap.textContent=serialize({imports,scopes});
  base.after(bridge,importmap);
  return {html:'<!doctype html>\n'+doc.documentElement.outerHTML,warnings};
}
