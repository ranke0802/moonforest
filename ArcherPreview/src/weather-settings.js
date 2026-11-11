export const WEATHER_KEY='moonforest-weather-v1';
const valid=new Set(['clear','cloudy','fog']);
export function normalizeWeather(value){return valid.has(value)?value:'clear';}
// Existing sky material and scene fog only: no particles, extra light, shadow,
// render target, observers or independent frame loop. Cave stays untouched.
export function setupWeatherSettings({host,storage,getWorld=()=>null,onChange=()=>{}}){
 const doc=host.ownerDocument,label=doc.createElement('label'),select=doc.createElement('select');select.className='quality-select';select.setAttribute('aria-label','날씨');select.innerHTML='<option value="clear">맑음 · 기본</option><option value="cloudy">흐림</option><option value="fog">안개</option>';label.append('날씨 ',select);host.append(label);
 let mode='clear',base=null,disposed=false;try{mode=normalizeWeather(storage?.getItem(WEATHER_KEY));}catch{}select.value=mode;
 function apply(){const world=getWorld();if(!world?.scene||!base||base.mapId!==world.mapId)return;const scene=world.scene;scene.fogStart=base.start;scene.fogEnd=base.end;scene.fogColor.copyFrom(base.color);world.sky.material.setFloat('weatherCloud',0);if(world.cave)return;if(mode==='cloudy')world.sky.material.setFloat('weatherCloud',.45);if(mode==='fog'){world.sky.material.setFloat('weatherCloud',.55);scene.fogStart=Math.min(base.start,22);scene.fogEnd=Math.min(base.end,65);}onChange();}
 function mapChanged(){const world=getWorld();if(!world?.scene)return;base={mapId:world.mapId,start:world.scene.fogStart,end:world.scene.fogEnd,color:world.scene.fogColor.clone()};apply();}
 const change=()=>{mode=normalizeWeather(select.value);try{storage?.setItem(WEATHER_KEY,mode);}catch{}apply();};select.addEventListener('change',change);
 return {get value(){return mode;},mapChanged,dispose(){if(disposed)return;disposed=true;mode='clear';apply();select.removeEventListener('change',change);label.remove();}};
}
