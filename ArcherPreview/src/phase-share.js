// A progress bar through work that reports no counts (user, 2026-11-21: the
// loading bar stood still at 35 % for the whole model stage, then jumped).
//
// phaseShare: how much of such a stretch has passed, judged from how long it
// took last time on this device. It reaches 90 % at the expected time and then
// goes on ever more slowly, never the whole way: the stretch ends only when the
// work says so. The measured time is kept for the next run (halfway between
// the old figure and the new one).
export function phaseShare(elapsed,expected){
  const x=Math.max(0,Number(elapsed)||0)/Math.max(1e-6,Number(expected)||0);
  return x<1?.9*x:.9+.09*(1-Math.exp(-(x-1)*1.2));
}
const KEY='moonforest:phasetimes:v1',MIN_MS=300,MAX_MS=120000;
const read=storage=>{const all=JSON.parse((storage??globalThis.localStorage)?.getItem(KEY)||'{}');return all&&typeof all==='object'&&!Array.isArray(all)?all:{};};
export function expectedPhaseMs(name,fallbackMs,storage){
  try{const value=read(storage)[name];return Number.isFinite(value)&&value>=MIN_MS&&value<=MAX_MS?value:fallbackMs;}catch{return fallbackMs;}
}
export function rememberPhaseMs(name,measuredMs,storage){
  if(!(measuredMs>=MIN_MS&&measuredMs<=MAX_MS))return false;
  try{
    const all=read(storage),previous=all[name];
    all[name]=Math.round(Number.isFinite(previous)&&previous>=MIN_MS&&previous<=MAX_MS?(previous+measuredMs)/2:measuredMs);
    (storage??globalThis.localStorage)?.setItem(KEY,JSON.stringify(all));return true;
  }catch{return false;}
}
