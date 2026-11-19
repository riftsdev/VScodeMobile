const CACHE='kgcode-shell-v2.0.0';
const SHELL=['./','./index.html','./styles.css','./icon.svg','./manifest.webmanifest','./src/app.js','./src/core.js','./src/storage.js','./src/deps.js','./src/preview.js','./src/python-worker.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kgcode-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope).pathname;
  if(!url.pathname.startsWith(scope))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Recurso indisponível offline.',{status:503}))));
});