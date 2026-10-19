// 下载内容完全自包含；与网页计算使用同一份 cleaning.py。
const PYTHON_SOURCE = /* PYTHON_SOURCE_PLACEHOLDER */;
const pythonSteps = PYTHON_SOURCE.split(/# STEP \d\n/).slice(1).map(s=>s.split(/# (?:STEP|PIPELINE)/)[0].trim());
const requirements = 'numpy>=1.26,<3\npandas>=2.2,<4\nmatplotlib>=3.8,<4\njupyterlab>=4,<5\nipykernel>=6,<8\n';
let pythonPromise = null, pythonRuntime = null, computeVersion = 0, matplotlibSVG = '';
async function ensurePython() {
  if (!pythonPromise) pythonPromise=(async()=>{
    $('runtimeStatus').textContent='正在加载 Python WebAssembly 环境…首次加载需下载依赖';
    const mod=await import('https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.mjs');
    const py=await mod.loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/'});
    $('runtimeStatus').textContent='正在加载 pandas / numpy / matplotlib…';
    await py.loadPackage(['pandas','matplotlib']);
    await py.runPythonAsync(PYTHON_SOURCE);
    pythonRuntime=py;
    return py;
  })().catch(e=>{pythonPromise=null;throw e;});
  return pythonPromise;
}
async function calculatePython(data, selection=1) {
  const version=++computeVersion;
  dataset=data;stages=[];matplotlibSVG='';selected=selection;page=0;tableMode='stage';render();
  // 导出与浏览器 Python 的加载互不依赖：无网时也可下载本地研究包。
  $('exportNotebook').disabled=false;
  try {
    const py=await ensurePython();if(version!==computeVersion)return;
    $('runtimeStatus').textContent='Python/pandas 正在执行六步清洗与 matplotlib 绘图…';
    py.globals.set('_input_json',JSON.stringify({raw:data.rows,options:options()}));
    const payload=await py.runPythonAsync("_request = json.loads(_input_json)\n_result = run_pipeline(_request['raw'], _request['options'])\njson.dumps({'stages': _result, 'svg': plot_svg(_request['raw'], _result[-1]['rows'])}, ensure_ascii=False, allow_nan=False)");
    if(version!==computeVersion)return;
    const result=JSON.parse(payload);stages=result.stages;matplotlibSVG=result.svg;render();
    $('runtimeStatus').textContent='● Python '+py.runPython('sys.version.split()[0]')+' / Pyodide '+py.version+' · pandas 引擎已执行 · matplotlib 图表 · 与下载代码同源';
  } catch(e) {
    if(version!==computeVersion)return;
    $('runtimeStatus').textContent='Python 环境加载/执行失败：'+e.message+'。仍可下载 Notebook / VS Code 包在本机运行。';
    log('Python 运行失败',String(e.message).slice(0,400));
    toast('浏览器 Python 暂不可用；可下载 Notebook 在本机运行，或点击完整流程重试。');
    $('runAll').disabled=false;
  }
}
function notebookDocument(data,params){
  const md=source=>({cell_type:'markdown',metadata:{},source});
  const code=source=>({cell_type:'code',metadata:{},execution_count:null,outputs:[],source});
  const sections=PYTHON_SOURCE.split(/(?=# STEP \d\n|# PIPELINE\n|# PLOT\n)/);
  const cells=[md('# Quant Cleanroom · 可复现量化研究\n\nPython / pandas / matplotlib。先安装依赖，再按顺序 Run All。每一步保留数据快照和详细中文注释。\n\n这是当前选中数据的固定快照，不需要联网或 API 密钥。as-of 时刻、标的、随机种子和污染来源均保存在 dataset 中。'),code('# 首次运行：安装依赖到当前 Notebook 内核。已安装时可跳过本单元格。\n%pip install "numpy>=1.26,<3" "pandas>=2.2,<4" "matplotlib>=3.8,<4"'),code(sections[0]),code('# 使用 JSON 文本嵌入原始输入，避免 Python/JavaScript 的 null、true、false 语法差异。\ndataset = json.loads('+JSON.stringify(JSON.stringify(data))+')\noptions = json.loads('+JSON.stringify(JSON.stringify(params))+')\nraw = dataset["rows"]\npd.DataFrame(raw).head(10)')];
  const execution=["df = normalize(raw)\ndisplay(df.head(10))\nprint('标准化记录:', len(df))", "df, rejected_open_dup = deduplicate(df, options)\ndisplay(rejected_open_dup.head(10))\nprint('未收盘/重复隔离:', len(rejected_open_dup))", "df, rejected_invalid = validate(df)\ndisplay(rejected_invalid.head(10))\nprint('非法行情隔离:', len(rejected_invalid))", "df, gaps = detect_gaps(df)\ndisplay(pd.DataFrame(gaps))\nprint('缺失分钟:', sum(g['missing'] for g in gaps))", "df = flag_outliers(df, options)\ndisplay(df.loc[df['flags'].map(lambda f: '异常收益' in f)])", "df = features(df)\ndisplay(df[['timestamp', 'close', 'ret', 'signalLag1', 'vol20', 'tradable']].tail(20))\nprint('研究就绪记录:', int(df['tradable'].sum()))"];
  sections.slice(1,7).forEach((section,i)=>{cells.push(md('## '+(i+1)+' · '+steps[i].title+'\n\n'+steps[i].body+'\n\n**研究含义：** '+steps[i].why));cells.push(code(section));cells.push(code(execution[i]));});
  cells.push(code(sections[7]),code(sections[8]));
  cells.push(md('## matplotlib 图表与可追溯输出\n\n有效价格曲线会在缺口/异常处断开；直方图只使用数据门槛通过的行，不代表策略收益。图片使用英文轴标题，以避免不同电脑缺少中文字体；代码和解释全部使用中文。'));
  cells.push(code("from pathlib import Path\nfrom IPython.display import display\nresult = run_pipeline(raw, options)\nfig = plot_quality(raw, result[-1]['rows'])\ndisplay(fig)\noutput_dir = Path('results')\noutput_dir.mkdir(exist_ok=True)\nfig.savefig(output_dir / 'quality_audit.png', dpi=160, bbox_inches='tight')\nplt.close(fig)\npd.DataFrame(result[-1]['rows']).to_csv(output_dir / 'cleaned.csv', index=False)\npd.DataFrame(result[2]['rejected'] + result[3]['rejected']).to_csv(output_dir / 'quarantine.csv', index=False)\n(output_dir / 'stages.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')\nprint('结果已写入:', output_dir.resolve())"));
  cells.push(md('## 实验边界\n\n仅适用于单标的、连续交易的 1 分钟加密 OHLCV。窗口外缺失、股票交易日历、复权、基本面公告时间、成交延迟和交易成本需要在后续研究中单独建模。'));
  return {nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.11'},cleanroom:{version:'2.0',datasetId:data.id,asOf:params.asOf,engine:'pandas'}},cells:cells.map((c,i)=>({...c,id:'cleanroom-'+i}))};
}
function vscodeScript(data,params){return '# %% [markdown]\n# # Quant Cleanroom · VS Code Python Interactive\n# 在 VS Code 中选择 Python 环境，点击 Run Cell；也可 python research.py 运行全部。\n# 先执行 python -m pip install -r requirements.txt。\n\n'+PYTHON_SOURCE+'\n\n# %%\n# 内嵌当前数据快照与参数：无需连接行情服务即可复现网页研究。\ndataset = json.loads('+JSON.stringify(JSON.stringify(data))+')\noptions = json.loads('+JSON.stringify(JSON.stringify(params))+')\n\n# %%\n# 执行流水线并输出每一步数据质量摘要。\nfrom pathlib import Path\nresult = run_pipeline(dataset["rows"], options)\nfor i, stage in enumerate(result):\n    print(f"Step {i}: rows={len(stage[\'rows\'])}, affected={stage[\'affected\']}")\n\n# %%\n# 保存图表、清洗结果、隔离表与完整审计快照。\n# 结果固定保存在脚本所在目录的 results/，不会依赖终端当前目录。\noutput_dir = Path(__file__).resolve().parent / "results" if "__file__" in globals() else Path.cwd() / "results"\noutput_dir.mkdir(exist_ok=True)\nfig = plot_quality(dataset["rows"], result[-1]["rows"])\nfig.savefig(output_dir / "quality_audit.png", dpi=160, bbox_inches="tight")\nplt.close(fig)\npd.DataFrame(result[-1]["rows"]).to_csv(output_dir / "cleaned.csv", index=False)\npd.DataFrame(result[2]["rejected"] + result[3]["rejected"]).to_csv(output_dir / "quarantine.csv", index=False)\n(output_dir / "stages.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")\nprint("输出目录:", output_dir)\n';}
function projectReadme(){return '# Quant Cleanroom · Python 研究包\n\n## Windows / VS Code\n\n```powershell\npython -m venv .venv\n.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt\n.\\.venv\\Scripts\\python.exe research.py\n.\\.venv\\Scripts\\python.exe -m jupyterlab research.ipynb\n```\n\nVS Code 安装 Microsoft Python 和 Jupyter 扩展。打开此目录，选择 .venv 的 Python 解释器；research.py 支持 # %% 单元格，research.ipynb 支持 Run All。Notebook 中可跳过已安装依赖的第一格。\n\n## 文件\n\n- research.ipynb：含数据、参数、逐步中文解释、代码和 matplotlib 图表。\n- research.py：同源 VS Code / 终端脚本，内嵌数据与参数。\n- cleaning.py：可复用清洗函数。\n- dataset.json：原始数据快照与来源元数据。\n- requirements.txt：Python 3.11+ 兼容依赖。\n- results/：运行后生成 cleaned.csv、quarantine.csv、stages.json、quality_audit.png。\n\n首次安装需要联网；依赖安装后，清洗与图表不需要网络。当前研究包是导出时选中数据的快照，不会自动拉取网站后续批次。公开版仅使用合成样本和浏览器本地 CSV，不包含远端市场池或自动采集。\n';}
// 无外部 ZIP 库：使用标准 ZIP store 格式，确保离线下载也可用。
function zipFiles(files){const encoder=new TextEncoder(),parts=[],central=[];let offset=0;const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};const header=n=>{const a=new Uint8Array(n);return [a,new DataView(a.buffer)];};for(const [name,text] of Object.entries(files)){const path=encoder.encode(name),body=encoder.encode(text),sum=crc(body);const [local,l]=header(30);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint32(14,sum,true);l.setUint32(18,body.length,true);l.setUint32(22,body.length,true);l.setUint16(26,path.length,true);parts.push(local,path,body);const [center,c]=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,sum,true);c.setUint32(20,body.length,true);c.setUint32(24,body.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);central.push(center,path);offset+=local.length+path.length+body.length;}const length=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,Object.keys(files).length,true);e.setUint16(10,Object.keys(files).length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});}
function researchFiles(data,params){return {'research.ipynb':JSON.stringify(notebookDocument(data,params),null,2),'research.py':vscodeScript(data,params),'cleaning.py':PYTHON_SOURCE,'dataset.json':JSON.stringify(data,null,2),'requirements.txt':requirements,'README.md':projectReadme(),'.vscode/settings.json':JSON.stringify({'python.defaultInterpreterPath':'${workspaceFolder}/.venv/Scripts/python.exe','jupyter.notebookFileRoot':'${workspaceFolder}'},null,2)};}
function exportResearch(kind='zip'){if(!dataset){toast('请先选择数据集');return;}const params=options(),prefix='cleanroom-'+dataset.id;const files=researchFiles(dataset,params);if(kind==='zip')download(prefix+'-python-project.zip',zipFiles(files),'application/zip');else if(kind==='ipynb')download(prefix+'.ipynb',files['research.ipynb']);else if(kind==='py')download(prefix+'.py',files['research.py'],'text/x-python;charset=utf-8');log('导出 Python 研究文件',kind+' · '+dataset.id);toast(kind==='zip'?'已下载 Notebook、VS Code 脚本、依赖和当前数据的完整研究包。':'已下载自包含文件；初次运行请先安装 pandas / numpy / matplotlib。');}
