export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_IMPORT = 50 * 1024 * 1024;
export function normalize(path) {
  if (typeof path !== 'string' || /[\x00-\x1f]/.test(path)) throw Error('Caminho inválido.');
  const parts = path.replaceAll('\\', '/').split('/').filter(x => x && x !== '.');
  if (parts.some(x => x === '..' || ['__proto__', 'constructor', 'prototype'].includes(x) || /[:?#]/.test(x))) throw Error('Use nomes sem .., :, ? ou #.');
  return parts.join('/');
}
export const dirname = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const basename = path => path.split('/').pop();
export const inside = (path, root) => !root || path === root || path.startsWith(root + '/');
export const relative = (path, root) => root ? path.slice(root.length + 1) : path;
export const ext = path => basename(path).split('.').pop().toLowerCase();
export const mode = path => ({html:'htmlmixed',htm:'htmlmixed',svg:'xml',xml:'xml',css:'css',js:'javascript',mjs:'javascript',json:{name:'javascript',json:true},py:'python',md:'markdown',ts:{name:'javascript',typescript:true}}[ext(path)] || 'text/plain');
export const mime = path => ({html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',ico:'image/x-icon',glb:'model/gltf-binary',gltf:'model/gltf+json',bin:'application/octet-stream',wasm:'application/wasm',pdf:'application/pdf',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf'}[ext(path)] || 'text/plain');
export const isText = path => /^(html?|css|[cm]?js|jsx|ts|tsx|json|gltf|svg|xml|py|md|txt|csv|yaml|yml|toml|ini|sh|sql|swift|kt|java|c|h|cpp|rs|go|vue|svelte|gitignore|env)$/i.test(ext(path));
export function textFile(content='') { return {type:'text', content}; }
export function directories(state) {
  const result = new Set(state.folders || []);
  for (const path of [...Object.keys(state.files),...(state.folders||[])]) { let p = dirname(path); while(p) {result.add(p);p = dirname(p);} }
  return [...result].sort();
}
export function assertVacant(state, path, excluding=[]) {
  if (!path) throw Error('Informe um nome.');
  const existing = [...Object.keys(state.files),...directories(state)].filter(p=>!excluding.includes(p));
  if (existing.includes(path)) throw Error('Já existe um arquivo ou pasta com esse nome.');
  const parents = path.split('/'); parents.pop();
  while(parents.length) {if(existing.includes(parents.join('/')) && state.files[parents.join('/')]) throw Error('Um arquivo ocupa o caminho da pasta.');parents.pop();}
}
export function movePath(state, from, to) {
  from = normalize(from); to = normalize(to);
  if (!from || !to || from === to || inside(to, from)) throw Error('Destino inválido.');
  const affected = [...Object.keys(state.files),...directories(state)].filter(p=>inside(p,from));
  if (!affected.length) throw Error('Caminho não encontrado.');
  const convert = p => inside(p,from) ? to + p.slice(from.length) : p;
  for (const p of affected) assertVacant(state, convert(p), affected);
  state.files = Object.fromEntries(Object.entries(state.files).map(([p,v])=>[convert(p),v]));
  state.folders = directories(state).filter(p=>!inside(p,from));
  for(const p of affected.filter(p=>!Object.hasOwn(state.files,convert(p)))) state.folders.push(convert(p));
  state.folders = [...new Set(state.folders)];
  state.tabs = state.tabs.map(convert); state.current = convert(state.current || '');
  state.root = convert(state.root || ''); state.selected = convert(state.selected || '');
  state.entries = Object.fromEntries(Object.entries(state.entries || {}).map(([k,v])=>[convert(k),convert(v)]));
  for(const key of ['previewStorage','githubBases'])if(state[key])state[key]=Object.fromEntries(Object.entries(state[key]).map(([k,v])=>[convert(k),v]));
}
export function resolveLocal(reference, from, root='') {
  if (!reference || reference.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) return null;
  const clean = reference.split(/[?#]/)[0];
  const parts = reference.startsWith('/') ? root.split('/').filter(Boolean) : dirname(from).split('/').filter(Boolean);
  for(const raw of clean.split('/')) {
    let part;
    try {part = decodeURIComponent(raw);} catch {throw Error('URL inválida: '+reference);}
    if (!part || part === '.') continue;
    if (part === '..') {if (!parts.length) throw Error('Referência fora da pasta: '+reference);parts.pop();}
    else {if(part.includes('/') || part.includes('\\')) throw Error('Separador codificado não permitido.');parts.push(part);}
  }
  const path = normalize(parts.join('/'));
  if (!inside(path,root)) throw Error('Referência fora da pasta selecionada: '+reference);
  return path;
}
export function bytes(file) {
  if (file.type === 'text') return new TextEncoder().encode(file.content);
  const bin = atob(file.content);return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
export function base64(data) {
  let result='';for(let i=0;i<data.length;i+=32768) result+=String.fromCharCode(...data.subarray(i,i+32768));
  return btoa(result);
}
export const dataURL = (file,path) => 'data:'+mime(path)+';base64,'+base64(bytes(file));
export function validateState(value) {
  if (!value || value.version !== 2 || !value.files || typeof value.files !== 'object') throw Error('Backup incompatível.');
  const files={};let total=0;
  for (const [path,file] of Object.entries(value.files)) {
    const p=normalize(path);
    if (!p || p!==path || !file || !['text','binary'].includes(file.type) || typeof file.content!=='string') throw Error('Arquivo inválido no backup.');
    const size=bytes(file).length;total+=size;if(size>MAX_FILE || total>MAX_IMPORT) throw Error('Backup acima do limite de 50 MB (10 MB por arquivo).');
    files[p]={type:file.type,content:file.content};
  }
  if (Object.keys(files).length>1000) throw Error('Limite de 1.000 arquivos.');
  if(value.folders!==undefined&&!Array.isArray(value.folders))throw Error('Lista de pastas inválida.');
  const folders=[...new Set((value.folders||[]).map(normalize))].filter(Boolean);
  for(const path of [...Object.keys(files),...folders]){
    if(folders.includes(path)&&Object.hasOwn(files,path))throw Error('Um caminho é arquivo e pasta: '+path);
    let p=dirname(path);
    while(p){if(Object.hasOwn(files,p))throw Error('Arquivo usado como pasta: '+p);p=dirname(p);}
  }
  const result={...freshState(false),...value,files,folders,settings:{...freshState(false).settings,...value.settings}};
  result.tabs=(Array.isArray(value.tabs)?value.tabs:[]).filter(p=>Object.hasOwn(files,p));
  result.root=normalize(typeof value.root==='string'?value.root:'');
  result.selected=normalize(typeof value.selected==='string'?value.selected:'');
  result.entries=Object.fromEntries(Object.entries(value.entries||{}).filter(([k,v])=>typeof v==='string'&&Object.hasOwn(files,v)&&inside(v,k)).map(([k,v])=>[normalize(k),v]));
  if(result.root&&!directories(result).includes(result.root))result.root='';
  result.settings.theme=result.settings.theme==='light'?'light':'dark';
  result.settings.fontSize=Math.min(24,Math.max(12,Number(result.settings.fontSize)||16));
  result.settings.wrap=Boolean(result.settings.wrap);
  result.settings.autoRun=Boolean(result.settings.autoRun);
  if(!Object.hasOwn(files,result.current)) result.current=Object.keys(files)[0]||'';
  return result;
}
export function freshState(demo=true) {
  return {version:2,files:demo?{
    'Meu-site/index.html':textFile('<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>Meu primeiro projeto</title>\n  <link rel="stylesheet" href="./css/style.css">\n</head>\n<body>\n  <main>\n    <span class="tag">FEITO NO KG CODE</span>\n    <h1>Grandes ideias.<br>Na palma da mão.</h1>\n    <p>HTML, CSS e JavaScript. Cada arquivo no seu lugar.</p>\n    <button id="count">Testar JavaScript · 0</button>\n    <small id="message">Altere os arquivos e toque em Executar.</small>\n  </main>\n  <script type="module" src="./js/main.js"></script>\n</body>\n</html>'),
    'Meu-site/css/style.css':textFile('*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#121826;color:#eef0ff;font-family:system-ui;display:grid;place-items:center;padding:28px}main{max-width:560px}.tag{font-size:11px;letter-spacing:2px;color:#a4b0ff}h1{font-size:clamp(28px,7vw,54px);letter-spacing:-1.8px;line-height:1.1}p{color:#a7b0c5;line-height:1.7}button{background:#98a7ff;color:#111828;border:0;border-radius:10px;padding:15px 22px;font-size:15px;font-weight:700;margin:15px 0;cursor:pointer}small{display:block;color:#7e8aa7;margin-top:10px}'),
    'Meu-site/js/main.js':textFile("import { title } from './message.js';\nlet count = 0;\ndocument.querySelector('#count').onclick = () => {\n  count++;\n  document.querySelector('#count').textContent = 'Testar JavaScript · ' + count;\n  console.log(title, count);\n};\nfetch('./data.json').then(r => r.json()).then(data => console.info(data.message));"),
    'Meu-site/js/message.js':textFile("export const title = 'Meu-site funcionando!';"),
    'Meu-site/data.json':textFile('{"message":"JSON local carregado com sucesso."}'),
    'Outro-projeto/index.html':textFile("<!doctype html><html lang=\"pt-BR\"><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"style.css\"></head><body><h1>Outro projeto</h1><p>Este CSS e este JavaScript ficam separados do Meu-site.</p><button onclick=\"console.log('Olá do outro projeto!')\">Testar console</button><script src=\"app.js\"></script></body></html>"),
    'Outro-projeto/style.css':textFile('body{background:#f5eddc;color:#41372b;font:18px system-ui;padding:32px}button{padding:12px;border-radius:8px;border:0;background:#3c6150;color:white}'),
    'Outro-projeto/app.js':textFile("console.info('Somente os arquivos deste projeto foram executados.');")
  }:{},folders:demo?['Meu-site','Meu-site/css','Meu-site/js','Outro-projeto']:[],root:demo?'Meu-site':'',selected:demo?'Meu-site':'',entries:demo?{'Meu-site':'Meu-site/index.html','Outro-projeto':'Outro-projeto/index.html'}:{},current:demo?'Meu-site/index.html':'',tabs:demo?['Meu-site/index.html']:[],settings:{theme:'dark',fontSize:16,wrap:true,autoRun:false},updated:Date.now()};
}