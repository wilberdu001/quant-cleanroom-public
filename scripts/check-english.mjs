import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
let count=0;
for(const name of files){
  if(/\.(png|jpe?g|gif|webp|woff2?)$/i.test(name))continue;
  let text=await readFile(new URL('../'+name,import.meta.url),'utf8');
  if(/\.(json|ipynb)$/i.test(name))text=JSON.stringify(JSON.parse(text.replace(/^\uFEFF/,'')));
  // Also inspect escaped Unicode in generated JavaScript strings.
  text=text.replace(/\\u([0-9a-f]{4})/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));
  assert(!/\p{Script=Han}/u.test(text),'CJK text in public deliverable: '+name);
  assert(!/lang=["']zh(?:-|["'])/i.test(text),'Non-English HTML language: '+name);
  count++;
}
console.log('PASS: English-only tracked text and decoded research artifacts ('+count+' files).');
