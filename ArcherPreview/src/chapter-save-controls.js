const labels={new:'새 진행 · 아직 저장 전',saved:'자동 저장됨',unavailable:'브라우저 저장 불가 · 이번 실행에서 보관 중',failed:'저장 실패 · 이번 실행에서 보관 중',corrupt:'저장 내용을 읽지 못했습니다 · 기존 원본 보존 중',unsupported:'다른 버전의 저장 파일입니다 · 기존 원본 보존 중',conflict:'다른 창에서 진행이 변경됐습니다 · 덮어쓰기 중단'};
export const chapterSaveStatus=(journey,walletState)=>'의뢰·가방 저장: '+(labels[journey.saveState]??(journey.volatile?'이번 실행에서 보관 중':'자동 저장됨'))+(['unavailable','failed','corrupt','unsupported','conflict'].includes(walletState)?' / 골드 저장: '+labels[walletState]:'');

/** User-triggered transfer only; no file/string serialization on the game frame. */
export function createChapterSaveControls({document:doc,journey,onApplied=()=>{},transfer={},getWalletState=()=>null}){
 const win=doc.defaultView??globalThis,details=doc.createElement('details'),urls=win.URL?.createObjectURL?win.URL:globalThis.URL;
 let disposed=false,pending=null,url=null,fileRequest=0;
 details.className='chapter-save-controls';details.innerHTML='<summary>의뢰·가방 기록 내보내기</summary><div class="chapter-save-body"><p data-save-status role="status"></p><p data-save-scope></p><div class="chapter-actions"><button type="button" class="uit-skin" data-save="retry">저장 재시도</button><button type="button" class="uit-skin" data-save="export">기록 파일 받기</button><button type="button" class="uit-skin" data-save="backup">이전 정상본 복구</button></div><a data-save-link hidden download="moonforest-chapter-progress.json">기록 파일 다시 받기</a><label data-save-import-label>진행 파일 열기 <input type="file" accept=".json,application/json" data-save-file></label><div data-save-confirm hidden><p data-save-preview></p><p>현재 의뢰 진행을 선택한 파일로 바꿉니다. 먼저 현재 진행 파일을 보관하세요.</p><button type="button" class="uit-skin" data-save="import">이 파일 적용</button><button type="button" class="uit-skin" data-save="cancel">취소</button></div><p data-save-feedback role="status" aria-live="polite"></p><textarea data-save-copy readonly aria-label="진행 JSON 복사" hidden></textarea></div>';
 const find=s=>details.querySelector(s),feedback=text=>{find('[data-save-feedback]').textContent=text;};
 function refresh(){
  find('[data-save-status]').textContent=chapterSaveStatus(journey,getWalletState());
  find('[data-save=retry]').disabled=['corrupt','unsupported','conflict'].includes(journey.saveState);
  find('[data-save=backup]').hidden=typeof transfer.recoverBackup!=='function'||journey.hasBackup===false;
  find('[data-save-import-label]').hidden=typeof transfer.importSave!=='function';
 }
 function release(){if(url){urls.revokeObjectURL?.(url);url=null;}find('[data-save-link]').hidden=true;}
 async function command(action){
  if(disposed)return;
  try{
   if(action==='retry'){const saved=journey.save();refresh();feedback(saved?'진행을 저장했습니다.':chapterSaveStatus(journey));return;}
   if(action==='cancel'){pending=null;find('[data-save-confirm]').hidden=true;find('[data-save-file]').value='';feedback('파일 적용을 취소했습니다.');return;}
   if(action==='export'){
    const text=transfer.exportSave?.()??journey.exportSave();release();
    try{url=urls.createObjectURL(new (win.Blob??globalThis.Blob)([text],{type:'application/json;charset=utf-8'}));const link=find('[data-save-link]');link.href=url;link.hidden=false;link.click();feedback('진행 파일 다운로드를 요청했습니다. 시작되지 않으면 파일 링크를 눌러 주세요.');}
    catch{const area=find('[data-save-copy]');area.value=text;area.hidden=false;area.focus();area.select?.();feedback('파일 다운로드를 시작하지 못했습니다. 아래 JSON을 복사해 보관하세요.');}return;
   }
   if(action==='import'){
    if(!pending||typeof transfer.importSave!=='function')return;const imported=await transfer.importSave(pending.text);if(disposed)return;
    if(!imported){refresh();feedback('진행 파일을 적용하지 못했습니다. '+chapterSaveStatus(journey));return;}
    pending=null;find('[data-save-confirm]').hidden=true;find('[data-save-file]').value='';refresh();feedback('진행 파일을 적용했습니다.');onApplied();return;
   }
   if(action==='backup'&&typeof transfer.recoverBackup==='function'){
    if(!find('[data-save-confirm]').hidden){pending=null;find('[data-save-confirm]').hidden=true;}
    // A separate confirmation keeps the recovery button from silently replacing progress.
    pending={backup:true};find('[data-save-preview]').textContent='이전에 정상 저장한 의뢰 진행으로 복구합니다.';find('[data-save-confirm]').hidden=false;
    find('[data-save=import]').textContent='정상본으로 복구';return;
   }
  }catch(error){if(!disposed){refresh();feedback(error?.message||'저장 파일을 처리하지 못했습니다. 기존 진행은 유지합니다.');}}
 }
 details.addEventListener('click',event=>{const button=event.target.closest?.('[data-save]');if(!button||button.disabled)return;
  event.preventDefault();event.stopPropagation();if(button.dataset.save==='import'&&pending?.backup){try{if(transfer.recoverBackup?.()){pending=null;find('[data-save-confirm]').hidden=true;refresh();feedback('이전 정상본으로 복구했습니다.');onApplied();}else{refresh();feedback('복구할 수 없습니다. '+chapterSaveStatus(journey));}}catch(error){feedback(error?.message||'정상본을 복구하지 못했습니다.');}return;}void command(button.dataset.save);
 });
 find('[data-save-file]').addEventListener('change',async event=>{
  const request=++fileRequest,file=event.target.files?.[0];pending=null;find('[data-save-confirm]').hidden=true;if(!file||typeof transfer.importSave!=='function')return;
  try{if(file.size>4*1024*1024)throw Error('진행 파일은 4MB 이하로 선택하세요.');const text=await file.text();if(disposed||request!==fileRequest)return;JSON.parse(text);pending={text,name:file.name};find('[data-save-preview]').textContent=file.name+' 파일을 선택했습니다.';find('[data-save=import]').textContent='이 파일 적용';find('[data-save-confirm]').hidden=false;feedback('아직 적용하지 않았습니다. 파일을 확인한 뒤 적용을 눌러 주세요.');}
  catch(error){if(!disposed)feedback(error?.message||'파일을 읽지 못했습니다.');}
 });
 find('[data-save-scope]').textContent=transfer.scope??'의뢰·소지품·경험치·미수령 보상을 기록합니다. 현재 골드 잔액·정산 원장·지도 위치·설정·맵 편집은 포함하지 않습니다. 전체 게임 세이브 가져오기는 지원하지 않습니다.';
 details.addEventListener('toggle',()=>{if(details.open){journey.flushBackup?.();refresh();}});refresh();
 return {element:details,refresh,dispose(){disposed=true;pending=null;release();details.remove();}};
}
