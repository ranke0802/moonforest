// A review-only visual effect entry. It never changes a spell, hitbox or damage.
export function setupEffectReviewSettings({host,release,onPreview,onMode}={}){
 if(release!=='moonforest-0.2'||!host)return {dispose(){}};
 const doc=host.ownerDocument,root=doc.createElement('details');root.className='effect-review-settings';
 const summary=doc.createElement('summary');summary.textContent='마법 효과 검수';root.append(summary);
 const note=doc.createElement('small');note.textContent='새 공용 효과의 화염 충격파 시안입니다. 앞쪽에 한 번 재생하며 피해나 전투 판정은 바꾸지 않습니다.';
 const label=doc.createElement('label');label.textContent='장식 밀도 ';const select=doc.createElement('select');select.setAttribute('aria-label','마법 장식 밀도');
 for(const [value,title]of [['compact','간결'],['standard','표준'],['rich','풍부']]){const o=doc.createElement('option');o.value=value;o.textContent=title;o.selected=value==='standard';select.append(o);}label.append(select);
 const button=doc.createElement('button');button.type='button';button.textContent='화염 충격파 재생';const status=doc.createElement('small');status.setAttribute('role','status');let busy=false,disposed=false;
 const change=()=>onMode?.(select.value),preview=async()=>{if(busy||disposed)return;busy=true;button.disabled=true;try{await onPreview?.(select.value);status.textContent='게임 화면에서 재생했습니다.';}catch(error){status.textContent='효과 준비 실패: '+error.message;}finally{busy=false;if(!disposed)button.disabled=false;}};
 select.addEventListener('change',change);button.addEventListener('click',preview);root.append(note,label,button,status);host.append(root);
 return {dispose(){disposed=true;select.removeEventListener('change',change);button.removeEventListener('click',preview);root.remove();}};
}
