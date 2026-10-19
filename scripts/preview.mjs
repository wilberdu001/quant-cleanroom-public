import http from 'node:http';
import {readFile} from 'node:fs/promises';
const file=new URL('../docs/index.html',import.meta.url);
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'||path==='/quant-cleanroom-public/'||path.endsWith('/index.html')){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(await readFile(file));
  }else{res.writeHead(404);res.end('Not found');}
}).listen(4174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4174/quant-cleanroom-public/'));
