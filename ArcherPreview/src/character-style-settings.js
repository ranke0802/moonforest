export const CHARACTER_STYLE_KEY='moonforest-character-style-v1';
// The player's baked ink and painted colors are already part of the approved
// model. Zero pixel adjustment / neutral color preserves that original look.
export const CHARACTER_STYLE_DEFAULTS=Object.freeze({
  player:Object.freeze({outline:true,outlineWidth:0,internal:true,internalStrength:0,brightness:1}),
  boss:Object.freeze({outline:true,outlineWidth:.5,internal:true,internalStrength:.2,brightness:1.35}),
});
const bounded=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(min,Math.min(max,value))*100)/100:fallback;
export function normalizeCharacterStyles(value){
  const result={version:1};
  for(const group of ['player','boss']){
    const d=CHARACTER_STYLE_DEFAULTS[group],v=value?.[group];
    result[group]={outline:typeof v?.outline==='boolean'?v.outline:d.outline,outlineWidth:bounded(v?.outlineWidth,group==='player'?-1:0,3,d.outlineWidth),internal:typeof v?.internal==='boolean'?v.internal:d.internal,internalStrength:bounded(v?.internalStrength,0,1,d.internalStrength),brightness:bounded(v?.brightness,.25,2.5,d.brightness)};
  }
  return result;
}
export class CharacterStyleSettings{
  constructor(storage){this.storage=storage;let saved;try{saved=JSON.parse(storage?.getItem(CHARACTER_STYLE_KEY));}catch{}this.value=normalizeCharacterStyles(saved);}
  set(group,change){if(!CHARACTER_STYLE_DEFAULTS[group])return this.value;this.value=normalizeCharacterStyles({...this.value,[group]:{...this.value[group],...change}});try{this.storage?.setItem(CHARACTER_STYLE_KEY,JSON.stringify(this.value));}catch{}return this.value;}
  reset(group){return this.set(group,CHARACTER_STYLE_DEFAULTS[group]);}
}

export function setupCharacterStylePanel({storage,onChange=()=>{},doc=document}={}){
  const settings=new CharacterStyleSettings(storage),dialog=doc.createElement('dialog');
  dialog.id='character-style-dialog';dialog.className='motion-speed-dialog character-style-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-labelledby','character-style-title');
  dialog.innerHTML=`<header><h2 id="character-style-title">캐릭터 선 · 밝기</h2><button type="button" class="close-style" aria-label="캐릭터 표현 설정 닫기">×</button></header>
    <label class="style-group-label">조절 대상<select id="character-style-group"><option value="player">주인공 · 장비</option><option value="boss">보스</option></select></label>
    <div class="style-control"><label><input id="character-outline-enabled" type="checkbox">외곽선</label><label for="character-outline-width"><span id="character-outline-label">굵기</span><output id="character-outline-value"></output></label><input id="character-outline-width" type="range" min="0" max="3" step="0.05"><small id="character-outline-note"></small></div>
    <div class="style-control"><label><input id="character-internal-enabled" type="checkbox">내부선</label><label for="character-internal-strength">강도<output id="character-internal-value"></output></label><input id="character-internal-strength" type="range" min="0" max="1" step="0.02"><small>원본 그림에 그려진 선은 유지됩니다.</small></div>
    <div class="style-control"><label for="character-brightness">밝기<output id="character-brightness-value"></output></label><input id="character-brightness" type="range" min="0.25" max="2.5" step="0.05"></div>
    <p>즉시 적용 · 대상별 자동 저장</p>
    <footer><button id="reset-character-style" type="button">이 대상 초기화</button><button class="close-style" type="button">저장하고 닫기</button></footer>`;
  doc.querySelector('#app').append(dialog);
  const q=s=>dialog.querySelector(s),group=q('#character-style-group');
  function render(){
    const v=settings.value[group.value],player=group.value==='player';
    q('#character-outline-enabled').checked=v.outline;q('#character-outline-width').min=player?-1:0;q('#character-outline-width').value=v.outlineWidth;q('#character-outline-width').disabled=!v.outline;
    q('#character-outline-label').textContent=player?'굵기 보정':'굵기';q('#character-outline-value').textContent=(player&&v.outlineWidth>0?'+':'')+v.outlineWidth.toFixed(2)+' px';
    q('#character-outline-note').textContent=player?'0 px는 원본 굵기입니다. −는 가늘게, +는 굵게 보정합니다.':'엘레나 기준값입니다. 곰·고블린은 기존 모습 대비 보정합니다.';
    q('#character-internal-enabled').checked=v.internal;q('#character-internal-strength').value=v.internalStrength;q('#character-internal-strength').disabled=!v.internal;q('#character-internal-value').textContent=v.internalStrength.toFixed(2);
    q('#character-brightness').value=v.brightness;q('#character-brightness-value').textContent=v.brightness.toFixed(2)+'×';
  }
  const save=change=>{settings.set(group.value,change);onChange(settings.value);render();};
  group.addEventListener('change',render);
  for(const [id,key] of [['outline-enabled','outline'],['internal-enabled','internal']])q('#character-'+id).addEventListener('change',e=>save({[key]:e.target.checked}));
  for(const [id,key] of [['outline-width','outlineWidth'],['internal-strength','internalStrength'],['brightness','brightness']])q('#character-'+id).addEventListener('input',e=>save({[key]:Number(e.target.value)}));
  q('#reset-character-style').addEventListener('click',()=>{settings.reset(group.value);onChange(settings.value);render();});
  for(const button of dialog.querySelectorAll('.close-style'))button.addEventListener('click',()=>dialog.close());
  doc.querySelector('#open-character-style').addEventListener('click',()=>{render();dialog.showModal();});
  render();return {settings,dialog};
}
