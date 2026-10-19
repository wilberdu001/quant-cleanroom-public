function simulate(seed, intensity=0.55, symbol='BTCUSDT') {
  let s=Number(seed)>>>0;
  const random=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
  const end=Date.UTC(2026,9,12,16,0),rows=[];
  let close=symbol.startsWith('ETH')?3200:symbol.startsWith('SOL')?150:67000;
  for(let i=0;i<240;i++) {
    const open=close;close=open*Math.exp((random()-.5)*.004);
    const r={id:i+1,symbol,timestamp:end-(240-i)*60000,open:open.toFixed(2),high:(Math.max(open,close)*(1+random()*.001)).toFixed(2),low:(Math.min(open,close)*(1-random()*.001)).toFixed(2),close:close.toFixed(2),volume:(10+random()*150).toFixed(4),closed:true};
    const p=random();
    if(p<intensity*.035) continue;
    if(p<intensity*.075) r.close='';
    else if(p<intensity*.105) r.volume='-12';
    else if(p<intensity*.135) r.high=(open*.5).toFixed(2);
    else if(p<intensity*.17) {r.close=(close*1.12).toFixed(2);r.high=(close*1.13).toFixed(2);r.injected='价格尖峰（练习注入）';}
    if(random()<intensity*.08) r.timestamp=Math.floor(r.timestamp/1000);
    rows.push(r);
    if(random()<intensity*.06) rows.push({...r,id:1000+i});
  }
  // Shuffle a few rows to model delayed packet arrival; duplicate policy remains arrival-based.
  for(let i=0;i<10;i++){const a=Math.floor(random()*rows.length),b=Math.floor(random()*rows.length);[rows[a],rows[b]]=[rows[b],rows[a]];}
  return {id:'sim-'+seed,rows,source:'合成 OHLCV · 固定历史时窗 · 人工注入污染',asOf:end,createdAt:new Date().toISOString(),seed,synthetic:true,symbol};
}
