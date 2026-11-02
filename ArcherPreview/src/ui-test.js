import {UiTestJourney,UI_TEST_QUESTS} from './ui-test-state.js';

const art={pie:new URL('./ui-test-art/pie.webp',import.meta.url).href,apple:new URL('./ui-test-art/apple.webp',import.meta.url).href,bandage:new URL('./ui-test-art/bandage.webp',import.meta.url).href,sword:new URL('./ui-test-art/sword.webp',import.meta.url).href};
const license=new URL('./ui-test-art/LICENSE.txt',import.meta.url).href;
const itemData={
 pie:{name:'따뜻한 애플파이',type:'food',category:'소모품 / 음식',description:'갓 구운 사과 향이 난다. 사용하면 실제 플레이어 체력을 최대 120 회복한다.'},
 apple:{name:'붉은 사과',type:'food',category:'의뢰 물품',description:'루미에게 건넬 사과. 네 개를 모아 이야기하기에서 전달하자.'},
 sword:{name:'장착 중인 검',type:'equipment',category:'장비 / 한손검',description:'현재 플레이어의 검을 그대로 사용한다. 장비 설정에서 외형과 능력치를 확인할 수 있다.'},
 bandage:{name:'교회 문장 붕대',type:'clue',category:'발견한 단서',description:'엘레나가 환자를 돌볼 때 쓰던 붕대. 농부의 이야기와 함께 여행 수첩에 기록되어 있다.'},
};
const button=(action,label,attrs='')=>`<button type="button" class="uit-skin" data-uit-action="${action}" ${attrs}>${label}</button>`;

/** The engine owns combat, camera, health and input. This module owns only UI-test scenarios. */
export function setupUiTest({root,storage,getState,heal,prepareHealing,onPauseChange=()=>{},resetInput=()=>{},openSettings=()=>{}}){
 const document=root.ownerDocument,win=document.defaultView,abort=new AbortController();
 const listen=(node,name,fn,opts={})=>node.addEventListener(name,fn,{...opts,signal:abort.signal});
 const journey=new UiTestJourney(storage);let screen='menu',selectedQuest='main',selectedItem='pie',filter='all',tab='quest',lastFocus=null,timer,lastUpdate=-Infinity,signature='',disposed=false;
 root.dataset.uiTest='true';
 const hud=document.createElement('section');hud.id='ui-test-hud';hud.setAttribute('data-ui','');hud.setAttribute('aria-label','UI테스트 의뢰');
 hud.innerHTML='<button class="uit-track" data-uit-action="journal"><small>UI테스트 · 마을</small><strong></strong><span></span></button><div class="uit-interactions"><button class="uit-skin" data-uit-action="dialogue">이야기하기</button><button class="uit-skin" data-uit-action="collect" hidden>사과 줍기</button></div><button class="uit-quick" data-uit-action="use-quick" hidden aria-label="애플파이 빠른 사용">애플파이 <b></b><kbd>Z</kbd></button>';
 root.append(hud);
 const dialog=document.createElement('dialog');dialog.id='ui-test-dialog';dialog.setAttribute('data-ui','');dialog.setAttribute('aria-labelledby','uit-title');root.append(dialog);
 const notice=document.createElement('output');notice.className='uit-toast';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;root.append(notice);
 const top=root.querySelector('.top-actions'),topButtons=[];
 for(const [action,label,icon] of [['journal','수첩','book'],['inventory','가방','bag'],['menu','메뉴','menu']]){
  const node=document.createElement('button');node.type='button';node.className='uit-top';node.dataset.uitAction=action;node.innerHTML=`<i class="uit-icon uit-icon-${icon}" aria-hidden="true"></i><span>${label}</span>`;node.setAttribute('aria-label',label+' 열기');node.setAttribute('aria-haspopup','dialog');top.insertBefore(node,top.querySelector('#fullscreen-button'));topButtons.push(node);
 }
 const settings=document.createElement('details');settings.className='settings-section';settings.innerHTML='<summary>UI테스트 · 표시와 체험</summary><div class="settings-section-body"><label><input id="uit-large-text" type="checkbox">대화·수첩 글자 크게</label><button type="button" data-uit-action="settings-menu">체험 메뉴 열기</button><small>테스트 의뢰·물품·골드·위치는 기존 플레이와 별도로 저장됩니다.</small><a href="'+license+'" target="_blank" rel="noopener">Galmuri 글꼴 라이선스</a></div>';
 root.querySelector('.settings-sections').prepend(settings);
 const applyText=()=>{root.dataset.uiText=journey.value.largeText?'large':'normal';settings.querySelector('input').checked=journey.value.largeText;};applyText();
 listen(settings.querySelector('input'),'change',e=>{journey.value.largeText=e.target.checked;journey.save();applyText();});
 const nowState=()=>getState()??{};
 function notify(message){clearTimeout(timer);notice.textContent=message;notice.hidden=false;timer=setTimeout(()=>{notice.hidden=true;},3200);}
 function close(){if(!dialog.open)return;dialog.close();}
 function open(next){
  if(!nowState().ready)return;
  if(document.querySelector('dialog[open]')&&!dialog.open)return;
  screen=next;resetInput();render();
  if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}
  root.dataset.uiPanel=screen;onPauseChange();
 }
 function counts(){const v=journey.value;return {pie:v.pie,apple:v.apple,sword:1,bandage:Number(v.clue)};}
 function heading(title,sub='MOONFOREST',extra=''){return `<header class="uit-heading"><div><small>${sub}</small><h1 id="uit-title">${title}</h1></div>${extra}<button type="button" class="uit-back" data-uit-action="close">돌아가기 <span>×</span></button></header>`;}
 function menu(){return heading('잠시 쉬어 가기','UI TEST')+`<div class="uit-menu-grid">${button('dialogue','농부와 대화')}${button('journal','여행 수첩 · L')}${button('inventory','가방 · I')}${button('settings','게임 설정')}${button('title','시작 화면')}${button('scenarios','테스트 상황 준비')}</div><p class="uit-note">이동·공격·방패·회피는 실제 게임입니다. 대화와 수첩을 열면 전투가 잠시 멈춥니다.</p>`;}
 function dialogue(){const v=journey.value;return heading('문 앞에 놓인 애플파이','우물 광장 · 대화 테스트')+`<div class="uit-dialogue-body"><article class="uit-dark"><small>농부 · 과수원을 돌보는 루미</small><p>${v.appleDone?'고마워요. 따뜻할 때 드세요.<br>그 사람도 이 파이를 좋아했는데…':v.apple===4?'사과를 모두 모아 오셨네요.<br>정말 고마워요.':v.accepted?'사과 네 개를 부탁할게요.<br>다 모으면 다시 와 주세요.':'사과 네 개만 가져다주시겠어요?<br>따뜻한 파이를 구울 참이거든요.'}</p><aside>“그날도 하나 더 구웠는데… 문 앞에 두고 그냥 돌아왔죠.”</aside><footer>의뢰 보상 · 애플파이 × 2 · 동물 먹이 × 2 · 경험치 70</footer></article><div class="uit-choices">${v.appleDone?button('inventory','받은 파이 확인하기'):v.apple===4?button('turn-in','사과를 가져왔어요.'):button('accept',v.accepted?'사과를 찾으러 갈게요.':'제가 가져다드릴게요.')}${button('learn','성녀에 관해 여쭤봐도 될까요?')}${button('close','다음에 다시 올게요.')}</div></div>`;}
 function journal(){const v=journey.value,q=UI_TEST_QUESTS[selectedQuest];return heading('여행 수첩','THE JOURNAL',`<nav class="uit-tabs"><button data-uit-action="quest-tab" aria-pressed="${tab==='quest'}">의뢰</button><button data-uit-action="clue-tab" aria-pressed="${tab==='clue'}">단서</button></nav>`)+(tab==='clue'?`<div class="uit-paper uit-clue">${v.clue?`<img src="${art.bandage}" alt="교회 문장 붕대"><div><small>발견한 단서 / 01</small><h2>교회 문장 붕대</h2><p>엘레나는 다친 이들을 먼저 돌봤다고 한다. 그녀가 떠난 날에는 숲 쪽에서 종소리가 들렸다고 루미는 기억한다.</p>${button('main-quest','관련 의뢰 보기')}</div>`:'<div><h2>아직 발견한 단서가 없습니다.</h2><p>농부에게 성녀에 관해 물어보세요.</p>'+button('dialogue','루미와 이야기하기')+'</div>'}</div>`:`<div class="uit-journal-body"><aside class="uit-quest-list">${Object.entries(UI_TEST_QUESTS).map(([id,item])=>`<button data-uit-action="quest" data-key="${id}" aria-pressed="${id===selectedQuest}"><small>${item.type}</small><strong>${item.name}</strong><span>${journey.objective(id)}</span></button>`).join('')}<small>획득 경험치 ${v.xp} · 자동 저장</small></aside><article class="uit-paper"><small>CHAPTER I / 사라진 성녀</small><h2>${q.name}</h2><p>${q.story}</p><div class="uit-objective"><small>다음 해야 할 일</small><strong>${journey.objective(selectedQuest)}</strong><span>${selectedQuest==='apple'?'사과 줍기 버튼으로 한 개씩 수집할 수 있습니다.':selectedQuest==='smith'?'테스트 상황에서 쇳조각을 준비할 수 있습니다.':'루미에게 이야기를 듣고 붕대를 기록하세요.'}</span></div><footer><span>보상<br>${q.reward}</span>${button('track','이 의뢰 추적')}${selectedQuest==='smith'&&v.iron===3?button('turn-in-iron','쇳조각 건네기'):''}</footer></article></div>`);}
 function inventory(){const values=counts(),item=itemData[selectedItem],visible=Object.entries(itemData).filter(([id,i])=>values[id]>0&&(filter==='all'||i.type===filter));return heading('소지품','BELONGINGS')+`<div class="uit-inventory-body"><nav class="uit-filters">${[['all','전체'],['food','소모품'],['equipment','장비'],['clue','단서']].map(([key,name])=>`<button data-uit-action="filter" data-key="${key}" aria-pressed="${filter===key}">${name}</button>`).join('')}</nav><div class="uit-items"><div class="uit-item-grid">${visible.map(([id,i])=>`<button data-uit-action="item" data-key="${id}" aria-label="${i.name} ${values[id]}개" aria-pressed="${id===selectedItem}"><img src="${art[id]}" alt=""><span>${id==='sword'?'장착 중':values[id]}</span></button>`).join('')}${Array.from({length:Math.max(0,8-visible.length)},()=>'<div class="uit-empty"></div>').join('')}</div><p>동물 먹이 ${journey.value.feed}개 · 경험치 ${journey.value.xp}<br>테스트 물품만 표시합니다.</p></div><article class="uit-paper uit-item-detail"><img src="${art[selectedItem]}" alt="${item.name}"><small>${item.category}</small><h2>${item.name}</h2><p>${item.description}</p><div class="uit-item-buttons">${selectedItem==='pie'?button('use-pie','사용하기 · +120',values.pie===0?'disabled':'')+button('quick',journey.value.quick?'빠른 사용 해제':'빠른 사용에 등록',values.pie===0?'disabled':''):selectedItem==='sword'?button('settings','장비 설정 열기'):button(selectedItem==='bandage'?'clue-tab':'apple-quest','관련 기록 보기')}</div><small>보유 ${values[selectedItem]}개${journey.value.quick&&selectedItem==='pie'?' · Z로 빠른 사용':''}</small></article></div>`;}
 function scenarios(){return heading('테스트 상황 준비','UI TEST')+`<p class="uit-note">실제 모델이나 전투 규칙을 바꾸지 않고 화면 기능을 확인합니다.</p><div class="uit-menu-grid">${button('accept','사과 의뢰 시작')}${button('sample-apples','사과 4개 준비')}${button('prepare-iron','쇳조각 3개 준비')}${button('prepare-heal','회복 테스트 · 체력 120 소모')}${button('reset-confirm','테스트 기록 초기화')}${button('feedback','버튼 눌림 확인')}</div><p class="uit-note">체력 소모는 전투가 없을 때만 가능하며 사망시키지 않습니다. 초기화는 테스트 의뢰와 가방에만 적용됩니다.</p>`;}
 function render(){
  dialog.dataset.screen=screen;
  const content=screen==='dialogue'?dialogue():screen==='journal'?journal():screen==='inventory'?inventory():screen==='scenarios'?scenarios():screen==='title'?heading('MOONFOREST','비탄의 성녀')+`<div class="uit-title-menu"><p>첫 번째 장 · 스무 가구의 마을</p>${button('close','여정 이어가기')}${button('reset-confirm','새로운 테스트 여정')}${button('settings','설정')}</div>`:screen==='reset-confirm'?heading('테스트 기록 초기화')+`<p class="uit-note">UI테스트의 의뢰·단서·가방만 처음 상태로 돌립니다. 기존 플레이 기록과 장비·화질 설정은 유지합니다.</p><div class="uit-menu-grid">${button('reset','초기화하기')}${button('menu','취소')}</div>`:screen==='feedback'?heading('손끝에 반응하는 화면')+`<div class="uit-menu-grid">${button('feedback-tap','기본 상태')}${button('feedback-tap','초점 상태')}${button('feedback-hold','길게 눌러보세요')}</div><p id="uit-feedback" class="uit-note" role="status">마우스 · 터치 · Enter / Space로 확인하세요.</p>`:menu();
  dialog.innerHTML=content+'<output id="uit-panel-status" role="status" aria-live="polite"></output>';
 }
 function message(value){notify(value);const out=dialog.querySelector('#uit-panel-status');if(out)out.textContent=value;}
 function usePie(){const amount=journey.usePie(heal);if(dialog.open)render();message(amount>0?`체력 ${amount} 회복 · 애플파이 1개 사용`:'체력이 가득 찼거나 지금은 사용할 수 없습니다.');refresh();}
 function action(name,key){
  if(name==='close'){close();return;}
  if(!nowState().ready)return;
  if(['menu','dialogue','journal','inventory','title','scenarios','reset-confirm','feedback'].includes(name)){open(name);return;}
  if(name==='settings'){close();openSettings();return;}
  if(name==='settings-menu'){root.querySelector('#motion-speed-dialog').close();open('menu');return;}
  if(name==='accept'){journey.accept();close();message('사과 줍기로 네 개를 모은 뒤 루미에게 건네세요.');}
  if(name==='collect'){if(journey.collect())message(`사과 ${journey.value.apple} / 4${journey.value.apple===4?' · 루미에게 돌아가세요.':''}`);}
  if(name==='sample-apples'){journey.accept();for(let i=0;i<4;i++)journey.collect();message('사과 4개 준비 완료. 농부에게 건네보세요.');}
  if(name==='turn-in'){if(journey.turnIn()){render();message('의뢰 완료 · 애플파이 × 2 · 동물 먹이 × 2 · 경험치 70');}}
  if(name==='learn'){const fresh=journey.learn();open('journal');tab='clue';render();message(fresh?'새로운 단서 · 교회 문장 붕대 · 경험치 100':'이미 기록한 이야기입니다.');}
  if(name==='quest'&&Object.hasOwn(UI_TEST_QUESTS,key)){selectedQuest=key;tab='quest';render();}
  if(name==='quest-tab'||name==='clue-tab'){tab=name==='quest-tab'?'quest':'clue';open('journal');}
  if(name==='main-quest'||name==='apple-quest'){selectedQuest=name==='main-quest'?'main':'apple';tab='quest';open('journal');}
  if(name==='track'){journey.track(selectedQuest);close();message('이 의뢰를 추적합니다.');}
  if(name==='filter'&&['all','food','equipment','clue'].includes(key)){filter=key;const first=Object.keys(itemData).find(id=>counts()[id]>0&&(key==='all'||itemData[id].type===key));if(first)selectedItem=first;render();}
  if(name==='item'&&Object.hasOwn(itemData,key)){selectedItem=key;render();}
  if(name==='use-pie'||(name==='use-quick'&&journey.value.quick))usePie();
  if(name==='quick'){journey.value.quick=!journey.value.quick;journey.save();render();message(journey.value.quick?'애플파이를 빠른 사용에 등록했습니다.':'빠른 사용을 해제했습니다.');}
  if(name==='prepare-iron'){journey.prepareIron();selectedQuest='smith';tab='quest';open('journal');message('쇳조각 3개 준비 완료. 의뢰 화면에서 전달하세요.');}
  if(name==='turn-in-iron'){if(journey.turnInIron()){render();message('의뢰 완료 · 경험치 80 · 수리 기록');}}
  if(name==='prepare-heal')message(prepareHealing()?'체력 120 소모. 가방의 애플파이로 회복해 보세요.':'전투 중이거나 지금은 준비할 수 없습니다.');
  if(name==='reset'){journey.reset();applyText();selectedQuest='main';selectedItem='pie';filter='all';tab='quest';open('menu');message('테스트 기록을 초기화했습니다.');}
  if(name.startsWith('feedback-'))message('입력 확인 · 놓으면 기본 상태로 돌아옵니다.');
  refresh();
 }
 function refresh(){
  const s=nowState(),v=journey.value;hud.hidden=!s.ready;for(const b of topButtons)b.disabled=!s.ready;
  const stamp=[s.ready,s.character,v.tracked,journey.objective(),v.quick,v.pie,v.accepted,v.appleDone,v.apple].join('|');if(stamp===signature)return;signature=stamp;
  const track=hud.querySelector('.uit-track');track.querySelector('small').textContent='UI테스트 · '+({'warrior-v3':'마을','warrior-v4':'마물의 숲','warrior-v5':'마녀의 동굴'}[s.character]??'마을');track.querySelector('strong').textContent=UI_TEST_QUESTS[v.tracked].name;track.querySelector('span').textContent=journey.objective();
  const collect=hud.querySelector('[data-uit-action="collect"]');collect.hidden=!v.accepted||v.appleDone||v.apple>=4;collect.textContent=`사과 줍기 ${v.apple}/4`;
  const quick=hud.querySelector('.uit-quick');quick.hidden=!v.quick;quick.disabled=v.pie<1;quick.querySelector('b').textContent=String(v.pie);
 }
 // Let the existing document-level UI audio handler receive the same click.
 listen(root,'click',e=>{const target=e.target.closest('[data-uit-action]');if(target&&!target.disabled)action(target.dataset.uitAction,target.dataset.key);});
 listen(dialog,'close',()=>{delete root.dataset.uiPanel;resetInput();onPauseChange();(lastFocus?.isConnected?lastFocus:root.querySelector('#viewport'))?.focus({preventScroll:true});});
 listen(dialog,'cancel',e=>{e.preventDefault();close();});
 listen(win,'keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;
  if(document.querySelector('dialog[open]')&&!dialog.open)return;
  const target={KeyL:'journal',KeyI:'inventory',Escape:dialog.open?'close':'menu',KeyZ:'use-quick'}[e.code];
  if(!target||target==='use-quick'&&dialog.open)return;e.preventDefault();e.stopPropagation();action(target);
 },{capture:true});
 let held=null;
 const release=()=>{held?.classList.remove('uit-down');held=null;};
 listen(root,'pointerdown',e=>{if(e.button!==0)return;const b=e.target.closest('button');if(b&&!b.disabled){release();held=b;b.classList.add('uit-down');if(b.dataset.uitAction==='feedback-hold')dialog.querySelector('#uit-feedback').textContent='누르고 있음';}});
 for(const name of ['pointerup','pointercancel','blur'])listen(win,name,release);
 listen(document,'visibilitychange',()=>{if(document.hidden)release();});
 refresh();
 return {isOpen:()=>dialog.open,update(time){if(time-lastUpdate<.2)return;lastUpdate=time;refresh();},inspect:()=>({screen:dialog.open?screen:'explore',...journey.value}),dispose(){if(disposed)return;disposed=true;close();abort.abort();release();clearTimeout(timer);hud.remove();dialog.remove();notice.remove();settings.remove();topButtons.forEach(b=>b.remove());delete root.dataset.uiTest;delete root.dataset.uiText;delete root.dataset.uiPanel;}};
}
