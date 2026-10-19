import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const [python,bridge,engine,ui]=await Promise.all(['cleaning.py','web/research.js','web/simulate.js','web/ui.html'].map(name=>readFile(new URL(name,root),'utf8')));
const steps=ui.slice(ui.indexOf('const steps='),ui.indexOf('let currentPool='));
const context={TextEncoder,Blob};vm.createContext(context);
vm.runInContext(engine+'\n'+steps+'\n'+bridge.replace('/* PYTHON_SOURCE_PLACEHOLDER */',JSON.stringify(python))+"\nconst sample=simulate(72641,.55,'BTCUSDT');sample.createdAt='2026-10-12T16:00:00.000Z';sample.intensity=.55;files=researchFiles(sample,{asOf:sample.asOf,threshold:8});",context);
for(const name of ['research.ipynb','research.py','dataset.json']){
  const text=context.files[name];
  if(/\p{Script=Han}/u.test(text))throw new Error('Non-English public research file: '+name);
  await writeFile(new URL(name,root),text);
}
console.log('Regenerated the English notebook, script, and seeded synthetic input.');
