import {QUEST_APPLE_TREE} from './chapter-quest-points.js';
// Explicit review UI, stripped from ordinary production builds by the caller.
export function setupPlainsReview({world,getState,moveTo,travel}){
 const panel=document.createElement('aside');panel.id='plains-review';
 panel.style.cssText='position:fixed;left:12px;bottom:86px;z-index:1000;padding:10px;max-width:460px;background:#17241ee8;color:#fff;border:1px solid #bdad79;border-radius:8px;font:12px sans-serif';
 const state=document.createElement('output');state.style.display='block';panel.append(state);
 const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-top:6px';panel.append(controls);
 const button=(label,run)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:7px;color:#fff;background:#405747;border:1px solid #c5bf9a;border-radius:4px';b.onclick=()=>{if(getState().ready)run();};controls.append(b);};
 const jump=(map,x,z)=>{if(getState().character!==map)return;moveTo(x,z);};
 button('대평원 시작',()=>travel('warrior-plains'));
 button('삼거리',()=>jump('warrior-plains',-5,25));
 button('교역 야영지',()=>jump('warrior-plains',16,72));
 button('숲 경계 통과',()=>jump('warrior-plains',64,-70));
 button('마을 귀환 통과',()=>jump('warrior-plains',-92,-35));
 button('마을에서 출발',()=>jump('warrior-v3',.35,74));
 button('숲에서 귀환',()=>jump('warrior-v4',0,49));
 button('사과나무 옆',()=>jump('warrior-v3',QUEST_APPLE_TREE.x+2,QUEST_APPLE_TREE.z));
 button('붕대 옆',()=>jump('warrior-plains',57,-58));
 button('약초 옆',()=>jump('warrior-v4',-26,17));
 document.body.append(panel);
 const observer=world.scene.onBeforeRenderObservable.add(()=>{const s=getState();state.textContent=`${s.character} · ${s.ready?'준비 완료':'로딩'} · X ${s.x?.toFixed(1)} / Z ${s.z?.toFixed(1)} · HP ${s.hp} · ${s.motion} #${s.actionId??0} · 충전 ${Math.round((s.charge??0)*100)}% · 예약 ${s.queued??"없음"}`;});
 world.scene.onDisposeObservable.addOnce(()=>{world.scene.onBeforeRenderObservable.remove(observer);panel.remove();});
}
