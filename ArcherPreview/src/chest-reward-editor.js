import {CHEST_REWARD_CHOICES,CHEST_ITEM_LIMIT,CHEST_ITEM_COUNT_LIMIT,normalizeChestItems,resolveChestRewards} from './chest-reward-data.js';
import {commercialItemVisual} from './commercial-ui.js';

// Metadata-only editor. Browsing a chest never instantiates drop models.
export function createChestRewardEditor(host,{getPoint,onChange}={}){
 const doc=host.ownerDocument,element=doc.createElement('section'),style=doc.createElement('style');
 element.className='chest-reward-editor';element.dataset.chestRewards='';
 element.innerHTML='<h4>현재 상자 아이템</h4><p data-chest-reward-mode></p><ul data-chest-reward-list></ul><div class="chest-reward-add"><label>아이템 선택<select data-chest-reward-choice></select></label><label>수량<input data-chest-reward-count type="number" min="1" max="9999" step="1" value="1"></label><button type="button" data-chest-reward-action="add">목록에 추가</button></div><button type="button" data-chest-reward-action="defaults">등급 기본 보상으로 복원</button><output data-chest-reward-status role="status" aria-live="polite"></output>';
 const select=element.querySelector('[data-chest-reward-choice]');
 for(const item of CHEST_REWARD_CHOICES){const option=doc.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}
 style.textContent='.chest-reward-editor h4{margin:8px 0}.chest-reward-editor ul{list-style:none;padding:0;margin:6px 0;max-height:240px;overflow:auto}.chest-reward-editor li{display:flex;align-items:center;gap:7px;border-bottom:1px solid #81907155;padding:5px 0}.chest-reward-editor li>span{flex:1;min-width:0}.chest-reward-editor li>i{width:30px;height:30px;flex:none;display:block}.chest-reward-editor li>i>img,.chest-reward-editor li>i>.commercial-icon{width:100%;height:100%;object-fit:contain}.chest-reward-editor li>button{min-width:44px;min-height:40px}.chest-reward-editor .chest-reward-add{display:flex;align-items:end;flex-wrap:wrap;gap:6px}.chest-reward-add>label:first-child{flex:1;min-width:120px}.chest-reward-add>label:nth-child(2){width:78px}.chest-reward-editor select,.chest-reward-editor input{width:100%;box-sizing:border-box;min-height:40px;font:inherit}.chest-reward-editor p,.chest-reward-editor output{font-size:12px;line-height:1.5}.chest-reward-editor output:empty{display:none}';
 host.append(style,element);let point=null,disabled=true,busy=false,disposed=false;
 const status=text=>{element.querySelector('[data-chest-reward-status]').textContent=text;};
 function controls(){for(const field of element.querySelectorAll('button,select,input'))field.disabled=disabled||busy||!point;}
 function render(value,{disabled:off=false}={}){
  point=value;disabled=off;const list=element.querySelector('[data-chest-reward-list]');list.replaceChildren();
  const items=Object.entries(point?resolveChestRewards(point)??{}:{});
  element.querySelector('[data-chest-reward-mode]').textContent=point?.chestItems===undefined?'등급 기본 보상입니다. 추가·삭제하면 이 목록을 직접 지정합니다.':'직접 지정한 목록입니다. 등급을 바꿔도 이 목록은 유지됩니다.';
  for(const [id,count] of items){
   const row=doc.createElement('li'),image=doc.createElement('i'),name=doc.createElement('span'),remove=doc.createElement('button');
   image.setAttribute('aria-hidden','true');if(id==='gold')image.textContent='G';else image.innerHTML=commercialItemVisual(id);
   const label=CHEST_REWARD_CHOICES.find(item=>item.id===id)?.name??id;name.textContent=label+' × '+count.toLocaleString();
   row.dataset.chestRewardItem=id;remove.type='button';remove.dataset.chestRewardRemove=id;remove.textContent='삭제';remove.setAttribute('aria-label',label+' 삭제');row.append(image,name,remove);list.append(row);
  }
  if(!items.length){const empty=doc.createElement('li');empty.textContent='설정된 아이템이 없습니다. 빈 상자로 열립니다.';list.append(empty);}
  controls();
 }
 async function click(event){
  const action=event.target.closest?.('[data-chest-reward-action]')?.dataset.chestRewardAction,remove=event.target.closest?.('[data-chest-reward-remove]')?.dataset.chestRewardRemove;
  if((!action&&!remove)||disposed||disabled||busy)return;const selected=getPoint?.();if(!selected)return;
  try{
   let items=Object.entries(resolveChestRewards(selected)??{}).map(([id,count])=>({id,count}));
   if(remove)items=items.filter(item=>item.id!==remove);
   else if(action==='defaults')items=undefined;
   else if(action==='add'){
    const id=select.value,count=Number(element.querySelector('[data-chest-reward-count]').value),existing=items.find(item=>item.id===id);
    if(!Number.isSafeInteger(count)||count<1||count>CHEST_ITEM_COUNT_LIMIT)throw Error('수량은 1~9,999개로 입력해 주세요.');
    if(existing)existing.count+=count;else{if(items.length>=CHEST_ITEM_LIMIT)throw Error('아이템은 최대 16종까지 추가할 수 있습니다.');items.push({id,count});}
   }else return;
   items=normalizeChestItems(items);busy=true;controls();await onChange(items);if(!disposed){render(getPoint?.()??selected,{disabled});status('목록을 변경했습니다. 게임에 적용하면 저장됩니다.');}
  }catch(error){if(!disposed)status(error.message);}finally{busy=false;if(!disposed)controls();}
 }
 element.addEventListener('click',click);render(null,{disabled:true});
 return {render,setDisabled(value){disabled=value;controls();},dispose(){disposed=true;element.removeEventListener('click',click);element.remove();style.remove();}};
}
