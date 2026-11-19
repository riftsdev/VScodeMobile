import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.SERVE_DIR||'dist');
const prefix='/VScodeMobile/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    let relative=decodeURIComponent(url.pathname);
    if(relative.startsWith(prefix))relative=relative.slice(prefix.length);
    else relative=relative.replace(/^\/+/,'');
    let file=path.resolve(root,relative||'index.html');
    if(file!==root&&!file.startsWith(root+path.sep))throw Error('Invalid path');
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('KG Code: http://127.0.0.1:4173/VScodeMobile/'));
