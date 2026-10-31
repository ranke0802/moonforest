import {BOSS_ATTACKS} from './boss-spec.js';
import {ELENA_SPELLS,MOURNING_SPELLS} from './elena-spec.js';

export const BOSS_PATTERN_CATALOG=Object.freeze({
  bear:{label:'곰 보스',patterns:BOSS_ATTACKS.map(s=>({id:s.name,label:s.label}))},
  elena:{label:'타락한 성녀 엘레나',patterns:ELENA_SPELLS.map(s=>({id:s.name,label:s.label}))},
  'mourning-elena':{label:'비탄의 마녀 엘레나',patterns:MOURNING_SPELLS.map(s=>({id:s.pattern,label:s.label+' · '+({cast:'한쪽 팔 시전',cast_slam:'전진 내려찍기',cast_alternate:'교대 시전'}[s.motion])}))},
});
export const BOSS_PATTERN_KEY='moonforest-boss-patterns-v1';
export function normalizeBossPatterns(value={}){
  const result={version:1};
  for(const [kind,catalog] of Object.entries(BOSS_PATTERN_CATALOG)){
    const config=value?.[kind],ids=new Set(catalog.patterns.map(p=>p.id));
    const sequence=Array.isArray(config?.sequence)?config.sequence.filter(id=>ids.has(id)).slice(0,12):[];
    const speed=Number(config?.speed);
    result[kind]={custom:config?.custom===true&&sequence.length>0,sequence,speed:Number.isFinite(speed)?Math.round(Math.max(.5,Math.min(2,speed))*10)/10:1};
  }
  return result;
}
export class BossPatternSettings {
  constructor(storage){this.storage=storage;let saved;try{saved=JSON.parse(storage?.getItem(BOSS_PATTERN_KEY));}catch{}this.value=normalizeBossPatterns(saved);}
  set(kind,config){this.value=normalizeBossPatterns({...this.value,[kind]:config});try{this.storage?.setItem(BOSS_PATTERN_KEY,JSON.stringify(this.value));}catch{}return this.value;}
  reset(kind){return this.set(kind,{speed:1,custom:false,sequence:[]});}
}

export function setupBossPatternPanel({storage,onChange=()=>{}}={}){
  const settings=new BossPatternSettings(storage),dialog=document.createElement('dialog');
  dialog.id='boss-pattern-dialog';dialog.className='motion-speed-dialog boss-pattern-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-labelledby','boss-pattern-title');
  dialog.innerHTML=`<header><h2 id="boss-pattern-title">보스 패턴 · 속도</h2><button type="button" class="close-pattern" aria-label="보스 설정 닫기">×</button></header>
    <label class="pattern-kind-label">보스<select id="pattern-boss-kind" aria-label="설정할 보스"></select></label>
    <label class="pattern-custom"><input id="pattern-custom" type="checkbox"> 지정한 순서로 반복</label>
    <div class="pattern-add-row"><select id="pattern-add-kind" aria-label="추가할 공격"></select><button id="pattern-add" type="button">추가</button></div>
    <ol id="pattern-stack" aria-label="공격 순서"></ol><p id="pattern-note" role="status"></p>
    <label class="pattern-speed-label" for="boss-attack-speed">공격 속도 <output id="boss-attack-speed-value"></output></label>
    <input id="boss-attack-speed" type="range" min="0.5" max="2" step="0.1" value="1">
    <p>기존 속도 기준이며 빠를수록 회피할 시간도 짧아집니다. 변경은 다음 공격부터 적용됩니다. 비탄의 마녀는 공격 사이에 이동합니다.</p>
    <button id="reset-boss-patterns" type="button">이 보스 기본값</button>`;
  document.querySelector('#app').append(dialog);
  const q=s=>dialog.querySelector(s),kind=q('#pattern-boss-kind'),stack=q('#pattern-stack'),addKind=q('#pattern-add-kind');
  for(const [id,cat] of Object.entries(BOSS_PATTERN_CATALOG)){const option=document.createElement('option');option.value=id;option.textContent=cat.label;kind.append(option);}
  function render(){
    const config=settings.value[kind.value],catalog=BOSS_PATTERN_CATALOG[kind.value];
    addKind.replaceChildren();for(const pattern of catalog.patterns){const option=document.createElement('option');option.value=pattern.id;option.textContent=pattern.label;addKind.append(option);}
    q('#pattern-custom').checked=config.custom;q('#boss-attack-speed').value=config.speed;q('#boss-attack-speed-value').textContent=config.speed.toFixed(1)+'×';
    q('#pattern-add').disabled=config.sequence.length>=12;stack.replaceChildren();
    config.sequence.forEach((id,index)=>{const li=document.createElement('li'),label=document.createElement('span');label.textContent=catalog.patterns.find(p=>p.id===id).label;li.append(label);
      for(const [action,text,disabled] of [['up','↑',index===0],['down','↓',index===config.sequence.length-1],['remove','×',false]]){
        const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.action=action;button.dataset.index=index;button.disabled=disabled;
        button.setAttribute('aria-label',`${index+1}번 ${label.textContent} ${action==='up'?'위로':action==='down'?'아래로':'삭제'}`);li.append(button);
      }stack.append(li);
    });
    q('#pattern-note').textContent=config.sequence.length?`${config.sequence.length} / 12 · ${config.custom?'위에서 아래로 반복':'기본 패턴 사용 중'}`:'공격을 추가하면 순서대로 반복합니다.';
  }
  function save(change){settings.set(kind.value,{...settings.value[kind.value],...change});onChange(settings.value);render();}
  kind.addEventListener('change',render);
  q('#pattern-add').addEventListener('click',()=>save({custom:true,sequence:[...settings.value[kind.value].sequence,addKind.value]}));
  q('#pattern-custom').addEventListener('change',e=>save({custom:e.target.checked,sequence:settings.value[kind.value].sequence.length?settings.value[kind.value].sequence:BOSS_PATTERN_CATALOG[kind.value].patterns.map(p=>p.id)}));
  stack.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button)return;const sequence=[...settings.value[kind.value].sequence],i=Number(button.dataset.index);if(button.dataset.action==='remove')sequence.splice(i,1);else{const j=i+(button.dataset.action==='up'?-1:1);[sequence[i],sequence[j]]=[sequence[j],sequence[i]];}save({sequence});});
  q('#boss-attack-speed').addEventListener('input',e=>save({speed:Number(e.target.value)}));
  q('#reset-boss-patterns').addEventListener('click',()=>{settings.reset(kind.value);onChange(settings.value);render();});
  q('.close-pattern').addEventListener('click',()=>dialog.close());
  const open=document.querySelector('#open-boss-patterns');open.addEventListener('click',()=>{render();dialog.showModal();});render();
  return {settings,dialog};
}
