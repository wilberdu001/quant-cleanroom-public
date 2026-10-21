// Downloads are self-contained and use the same cleaning.py implementation as the browser.
const PYTHON_SOURCE = /* PYTHON_SOURCE_PLACEHOLDER */;
const pythonSteps = PYTHON_SOURCE.split(/# STEP \d\n/).slice(1).map(s=>s.split(/# (?:STEP|PIPELINE)/)[0].trim());
const requirements = 'numpy>=1.26,<3\npandas>=2.2,<4\nmatplotlib>=3.8,<4\npillow>=13.0.0,<14\njupyterlab>=4,<5\nipykernel>=6,<8\n';
let pythonPromise = null, pythonRuntime = null, computeVersion = 0, matplotlibSVG = '';
async function ensurePython() {
  if (!pythonPromise) pythonPromise=(async()=>{
    $('runtimeStatus').textContent='Loading Python WebAssembly... First use downloads the runtime.';
    const mod=await import('https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.mjs');
    const py=await mod.loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.28.2/full/'});
    $('runtimeStatus').textContent='Loading pandas / NumPy / matplotlib...';
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
  // Research downloads do not depend on successful browser-runtime initialization.
  $('exportNotebook').disabled=false;
  try {
    const py=await ensurePython();if(version!==computeVersion)return;
    $('runtimeStatus').textContent='Python/pandas is executing six cleaning stages and rendering matplotlib figures...';
    py.globals.set('_input_json',JSON.stringify({raw:data.rows,options:options()}));
    const payload=await py.runPythonAsync("_request = json.loads(_input_json)\n_result = run_pipeline(_request['raw'], _request['options'])\njson.dumps({'stages': _result, 'svg': plot_svg(_request['raw'], _result[-1]['rows'])}, ensure_ascii=False, allow_nan=False)");
    if(version!==computeVersion)return;
    const result=JSON.parse(payload);stages=result.stages;matplotlibSVG=result.svg;render();
    $('runtimeStatus').textContent='● Python '+py.runPython('sys.version.split()[0]')+' / Pyodide '+py.version+' · pandas executed · matplotlib figures · same source as downloads';
  } catch(e) {
    if(version!==computeVersion)return;
    $('runtimeStatus').textContent='Python initialization/execution failed: '+e.message+'. You can still download the notebook or VS Code package and run locally.';
    log('Python execution failed',String(e.message).slice(0,400));
    toast('Browser Python is unavailable. Download the notebook to run locally, or retry the full pipeline.');
    $('runAll').disabled=false;
  }
}
function notebookDocument(data, params) {
  const md = source => ({cell_type:'markdown', metadata:{}, source});
  const code = source => ({cell_type:'code', metadata:{}, execution_count:null, outputs:[], source});
  const sections = PYTHON_SOURCE.split(/(?=# STEP \d\n|# PIPELINE\n|# PLOT\n)/);
  const cells = [
    md('# Quant Cleanroom: reproducible OHLCV research\n\nPython / pandas / matplotlib. Execute cells in order to inspect every intermediate snapshot and quarantine decision.\n\nThis notebook embeds the selected input and its as-of cutoff, instrument, seed, and source metadata. No live feed, API key, or website account is required.'),
    code('# Install dependencies in this notebook kernel. Skip this cell if they are already installed.\n%pip install "numpy>=1.26,<3" "pandas>=2.2,<4" "matplotlib>=3.8,<4" "pillow>=13.0.0,<14"'),
    code(sections[0]),
    code('# Embed raw input as JSON so Python and JavaScript null/boolean syntax cannot diverge.\ndataset = json.loads(' + JSON.stringify(JSON.stringify(data)) + ')\noptions = json.loads(' + JSON.stringify(JSON.stringify(params)) + ')\nraw = dataset["rows"]\npd.DataFrame(raw).head(10)')
  ];
  const execution = [
    "df = normalize(raw)\ndisplay(df.head(10))\nprint('Normalized records:', len(df))",
    "df, rejected_open_dup = deduplicate(df, options)\ndisplay(rejected_open_dup.head(10))\nprint('Unfinished or duplicate records:', len(rejected_open_dup))",
    "df, rejected_invalid = validate(df)\ndisplay(rejected_invalid.head(10))\nprint('Invalid OHLCV records:', len(rejected_invalid))",
    "df, gaps = detect_gaps(df)\ndisplay(pd.DataFrame(gaps))\nprint('Missing minutes:', sum(g['missing'] for g in gaps))",
    "df = flag_outliers(df, options)\ndisplay(df.loc[df['flags'].map(lambda f: 'Unusual return' in f)])",
    "df = features(df)\ndisplay(df[['timestamp', 'close', 'ret', 'signalLag1', 'vol20', 'tradable']].tail(20))\nprint('Data-ready records:', int(df['tradable'].sum()))"
  ];
  sections.slice(1,7).forEach((section,i) => {
    cells.push(md('## ' + (i+1) + '. ' + steps[i].title + '\n\n' + steps[i].body + '\n\n**Research rationale:** ' + steps[i].why));
    cells.push(code(section), code(execution[i]));
  });
  cells.push(code(sections[7]), code(sections[8]));
  cells.push(md('## Matplotlib diagnostics and traceable outputs\n\nThe accepted-price trace breaks at gaps and flagged observations. The histogram uses only data-ready rows. It does not show strategy returns. Plotting-only NaNs are not written back to the research dataset.'));
  cells.push(code("from pathlib import Path\nfrom IPython.display import display\nresult = run_pipeline(raw, options)\nfig = plot_quality(raw, result[-1]['rows'])\ndisplay(fig)\noutput_dir = Path('results')\noutput_dir.mkdir(exist_ok=True)\nfig.savefig(output_dir / 'quality_audit.png', dpi=160, bbox_inches='tight')\nplt.close(fig)\npd.DataFrame(result[-1]['rows']).to_csv(output_dir / 'cleaned.csv', index=False)\npd.DataFrame(result[2]['rejected'] + result[3]['rejected']).to_csv(output_dir / 'quarantine.csv', index=False)\n(output_dir / 'stages.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')\nprint('Results written to:', output_dir.resolve())"));
  cells.push(md('## Experimental boundaries\n\nThis example assumes one instrument in a continuously traded, one-minute market. Equity calendars, corporate actions, publication-time joins, survivorship bias, execution latency, liquidity, spreads, slippage, and fees require separate modeling. `tradable` is a data-readiness field, not an execution guarantee or evidence of alpha.'));
  return {nbformat:4, nbformat_minor:5, metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.11'},cleanroom:{version:'2.1',datasetId:data.id,asOf:params.asOf,engine:'pandas'}},cells:cells.map((c,i)=>({...c,id:'cleanroom-'+i}))};
}
function vscodeScript(data, params) {
  const setup = '# %% [markdown]\n# # Quant Cleanroom: VS Code Python Interactive\n# Select your Python environment, then Run Cell; or run python research.py.\n# First install dependencies: python -m pip install -r requirements.txt.\n\n';
  const input = '\n\n# %%\n# Embed the selected snapshot and cutoff; no live-data connection is required.\ndataset = json.loads(' + JSON.stringify(JSON.stringify(data)) + ')\noptions = json.loads(' + JSON.stringify(JSON.stringify(params)) + ')\n';
  const run = '\n# %%\n# Execute the pipeline and print each stage\'s auditable counts.\nfrom pathlib import Path\nresult = run_pipeline(dataset["rows"], options)\nfor i, stage in enumerate(result):\n    print(f"Step {i}: rows={len(stage[\'rows\'])}, affected={stage[\'affected\']}")\n';
  const output = '\n# %%\n# Save diagnostics, accepted rows, quarantine evidence, and all intermediate snapshots.\n# Script output is anchored beside this file; interactive cells use the working directory.\noutput_dir = Path(__file__).resolve().parent / "results" if "__file__" in globals() else Path.cwd() / "results"\noutput_dir.mkdir(exist_ok=True)\nfig = plot_quality(dataset["rows"], result[-1]["rows"])\nfig.savefig(output_dir / "quality_audit.png", dpi=160, bbox_inches="tight")\nplt.close(fig)\npd.DataFrame(result[-1]["rows"]).to_csv(output_dir / "cleaned.csv", index=False)\npd.DataFrame(result[2]["rejected"] + result[3]["rejected"]).to_csv(output_dir / "quarantine.csv", index=False)\n(output_dir / "stages.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")\nprint("Output directory:", output_dir)\n';
  return setup + PYTHON_SOURCE + input + run + output;
}
function projectReadme() {
  return '# Quant Cleanroom: Python research package\n\n## Windows / VS Code\n\n```powershell\npython -m venv .venv\n.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt\n.\\.venv\\Scripts\\python.exe research.py\n.\\.venv\\Scripts\\python.exe -m jupyterlab research.ipynb\n```\n\nOn macOS/Linux, use .venv/bin/python. In VS Code, select this virtual environment. research.py supports # %% cells, and research.ipynb supports Run All. Skip the installation cell if dependencies are already available.\n\n## Files\n\n- research.ipynb: embedded input, parameters, annotated stages, and matplotlib diagnostics.\n- research.py: the equivalent VS Code / terminal experiment.\n- cleaning.py: reusable pandas cleaning functions.\n- dataset.json: raw input and provenance metadata.\n- requirements.txt: dependencies for Python 3.11+.\n- results/: generated cleaned.csv, quarantine.csv, stages.json, and quality_audit.png.\n\nDependency installation requires internet. After installation, the embedded experiment runs offline. This package is a snapshot of the selected data, not an automatically updating feed. The public demo uses only synthetic samples and browser-local CSV input; no remote market pool or scheduled collector is included.\n';
}

// Use the standard ZIP store format without an external library, including for offline exports.
function zipFiles(files){const encoder=new TextEncoder(),parts=[],central=[];let offset=0;const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};const header=n=>{const a=new Uint8Array(n);return [a,new DataView(a.buffer)];};for(const [name,text] of Object.entries(files)){const path=encoder.encode(name),body=encoder.encode(text),sum=crc(body);const [local,l]=header(30);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint32(14,sum,true);l.setUint32(18,body.length,true);l.setUint32(22,body.length,true);l.setUint16(26,path.length,true);parts.push(local,path,body);const [center,c]=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,sum,true);c.setUint32(20,body.length,true);c.setUint32(24,body.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);central.push(center,path);offset+=local.length+path.length+body.length;}const length=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,Object.keys(files).length,true);e.setUint16(10,Object.keys(files).length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});}
function researchFiles(data,params){return {'research.ipynb':JSON.stringify(notebookDocument(data,params),null,2),'research.py':vscodeScript(data,params),'cleaning.py':PYTHON_SOURCE,'dataset.json':JSON.stringify(data,null,2),'requirements.txt':requirements,'README.md':projectReadme(),'.vscode/settings.json':JSON.stringify({'python.defaultInterpreterPath':'${workspaceFolder}/.venv/Scripts/python.exe','jupyter.notebookFileRoot':'${workspaceFolder}'},null,2)};}
function exportResearch(kind='zip'){if(!dataset){toast('Select a dataset first.');return;}const params=options(),prefix='cleanroom-'+dataset.id;const files=researchFiles(dataset,params);if(kind==='zip')download(prefix+'-python-project.zip',zipFiles(files),'application/zip');else if(kind==='ipynb')download(prefix+'.ipynb',files['research.ipynb']);else if(kind==='py')download(prefix+'.py',files['research.py'],'text/x-python;charset=utf-8');log('Export Python research files',kind+' · '+dataset.id);toast(kind==='zip'?'Downloaded the notebook, VS Code script, dependencies, and selected data as a research package.':'Downloaded a self-contained file. Install pandas, NumPy, and matplotlib before the first run.');}
