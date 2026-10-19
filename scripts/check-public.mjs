import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(\.openai|\.sites-runtime|\.preview-data|\.venv|node_modules|backups)(\/|$)|(^|\/)\.env($|\.)|(^|\/)\.dev\.vars$|\.(pem|key|sql|tar\.gz)$/;
const privateText=/github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|appgprj_[a-z0-9]+|[A-Z]:[\\/]+Users[\\/]+[^\s"']+|https:\/\/[^\s"']*\.chatgpt\.site/;
for(const name of files){
 assert(!forbidden.test(name),'Excluded file in public tree: '+name);
 if(/\.(png|jpg|jpeg)$/i.test(name))continue;
 const text=await fs.readFile(path.join(root,name),'utf8');
 assert(!privateText.test(text),'Private identity or credential pattern in: '+name);
}
const html=await fs.readFile(path.join(root,'docs/index.html'),'utf8');
assert(!/\/api\/|OAI-Sites-Authorization|KRAKEN|data-pool="market"/.test(html),'Private market connection in demo');
assert(html.includes('PUBLIC DEMO')&&html.includes('合成数据'));
const code=html.match(/<script>([\s\S]*)<\/script>/)[1];new vm.Script(code);
// 静态页面绑定的每个字面量 ID 均必须存在；避免裁剪市场功能后出现空控件异常。
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const [,id] of code.matchAll(/\$\('([^']+)'\)/g))assert(ids.has(id),'Missing element: '+id);
assert(!html.includes('/* PYTHON_SOURCE_PLACEHOLDER */'));
console.log('PASS: public content boundary, static demo syntax, bindings and embedded Python. Files: '+files.length);
