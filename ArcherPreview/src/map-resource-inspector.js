import {snapshotMapResourceInventory} from './map-resource-inventory.js';
import {captureMapPolygonInputs,estimateMapPolygonInputs} from './map-polygon-estimate.js';

const esc=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(value)?value.toLocaleString('ko-KR'):'미확정';
const bytes=value=>Number.isFinite(value)?`${(value/1048576).toFixed(2)} MiB`:'미확정';
const names={'village':'마을','great-plains':'대평원','monster-forest':'마물의 숲','witch-cave':'마녀의 동굴'};
const categories={player:'플레이어',actors:'몬스터·NPC',terrain:'지형',scenery:'풍경',outline:'외곽선',other:'기타'};
const statuses={'cache-storage':'캐시 확인','initial-plan-reuse':'최초 준비 재사용','prepared-reuse':'준비 재사용',prepared:'준비 완료','bundle-extracted':'묶음에서 추출','loader-fallback':'실제 로더에 위임',failed:'실패',cancelled:'취소',requested:'확인 중',fetching:'받는 중',extracted:'추출 완료'};
const kinds={texture:'텍스처',model:'모델',geometry:'형상',decoder:'디코더',audio:'음원',other:'기타'};
function table(headers,rows){return `<div class="map-resource-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">기록 없음</td></tr>`}</tbody></table></div>`;}
const detail=(title,body)=>`<details><summary>${esc(title)}</summary>${body}</details>`;
const metric=(title,value,note)=>`<div><dt>${esc(title)}</dt><dd>${esc(value)}</dd><small>${esc(note)}</small></div>`;

export function mapResourceReportMarkup(report){
 const inventory=report.inventory,t=inventory?.totals,estimate=report.placementEstimate,prep=report.preparation,initial=prep?.phases?.initial;
 const title=`${names[report.mapId]??report.mapId} · ${report.kind==='load-ready'?'이번 로딩 완료 시점':'지금 다시 집계'}`;
 const initialFiles=prep?.files?.filter(row=>row.phases?.initial)??[],initialBytes=initialFiles.reduce((sum,row)=>sum+(row.logicalBytes??0),0);
 let body=`<h3>${esc(title)}</h3><p>${esc(report.createdAt)} · 집계 ${number(inventory?.cpuMs?.toFixed?Number(inventory.cpuMs.toFixed(1)):null)} ms</p>`;
 if(report.error)body+=`<p role="alert">일부 집계 실패: ${esc(report.error)}</p>`;
 if(t){
 body+=`<dl class="map-resource-metrics">${metric('맵 전체 배치 예상치',number(estimate?.estimatedTotal)+' 삼각형','모든 배치를 근거리 LOD로 가정 + 지형. 미로딩·화면 밖 포함.')}${metric('상주 고유 지오메트리',number(t.uniqueGeometryTriangles)+' 삼각형',`${number(t.uniqueGeometries)}개 형상. 공유 중복 제외 · 모든 상주 LOD/숨긴 풀 포함.`)}${metric('직전 엔진 프레임 제출량',number(t.submittedTriangles)+' 삼각형','외곽선·그림자·배우 반복 패스 포함。일시정지 중이면 마지막 화면 준비/재렌더 프레임입니다.')}${metric('텍스처 상주량 추정',bytes(t.textureBytesEstimate),`${number(t.internalTextures)}개 내부 텍스처 · 용량 미확정 ${number(t.textureBytesUnknown)}개.`)}${metric('형상 버퍼 확인 용량',bytes(t.geometryBufferBytesKnown),`용량 미확정 버퍼 ${number(t.geometryBuffersUnknown)}개. 드라이버·전체 GPU RAM 아님.`)}${metric('최초 준비 파일',prep?number(initialFiles.length)+'개':'기록 없음',`논리 파일 합계 ${prep?bytes(initialBytes):'미확정'}. 모델·텍스처 상주량과 별개.`)}</dl>`;
 body+=`<p>표면 메시 항목 ${number(t.surfaceMeshEntries)}개 · 재질 ${number(t.materials)}개 · 외곽선 메시 ${number(t.outlineMeshEntries)}개. 상주 배치 기본 형상 합계 ${number(t.placementBaseTriangles)}삼각형은 인스턴스를 반복 합산하며, 실제 선택된 LOD/가시성은 반영하지 않습니다.</p>`;
 }
 if(!estimate)body+='<p>배치별 원인 목록은 리소스 보기에서 불러옵니다. 이 목록을 여는 과정에서 게임 모델·텍스처를 추가 로딩하지 않습니다.</p>';
 else body+=detail('전체 배치 예상치: 큰 항목 순서',`<p>집계 불가 ${number(estimate.unknown)}개 · 배우·효과·외곽선·그림자 제외</p>`+table(['에셋','배치 수','개당 근거리 삼각형','배치 합계'],estimate.assets.map(r=>[r.name,r.placements,number(r.trianglesEach),number(r.triangles)])));
 if(inventory){
 body+=detail('실제로 올라온 모델·형상',`<p>LOD 대체 형상·숨겨둔 템플릿도 포함합니다. 에셋 간 공유 형상이 있어 행별 고유 값을 합하면 중복될 수 있습니다. 배치 메시 수는 오브젝트 개수와 다릅니다.</p>`+table(['에셋 / 식별 근거','구분','메시','배치 기본 삼각형 합계','고유 형상 삼각형','로드된 LOD / 모델 파일'],inventory.assets.map(r=>[`${r.assetId} (${r.basis})`,categories[r.category]??r.category,r.meshEntries,number(r.placementBaseTriangles),number(r.uniqueGeometryTriangles),`${r.loadedLods?.join(', ')||'미상'} / ${r.modelFiles?.join('\n')||'미상'}`])));
 body+=detail('실제로 올라온 텍스처: 큰 용량 순서',`<p>압축 포맷·크기·밉맵으로 추정합니다. 엔진 캐시에만 남은 텍스처는 별도 표기합니다. 프레임버퍼·깊이·MSAA·드라이버 비용은 제외합니다.</p>`+table(['파일 / 이름','해상도','형식','밉맵','추정 용량','참조'],inventory.textures.map(r=>[r.name,`${r.width??'?'} × ${r.height??'?'}`,r.format,r.mipmapped?'있음':'없음',bytes(r.estimatedBytes),r.sceneReferenced?'현재 Scene':'엔진 캐시'])));
 if(Object.values(inventory.truncated).some(Boolean))body+=`<p>목록 상한 초과: ${esc(JSON.stringify(inventory.truncated))}. 요약 합계에는 전체를 포함합니다.</p>`;
 }
 if(prep){
 body+=`<p>최초 준비: 캐시 확인 ${number(initial?.cacheHits)}회 · 준비 재사용 ${number(initial?.preparedReuses)}회 · 파일 요청 ${number(initial?.fileRequests)}회 · 묶음 요청 ${number(initial?.bundleRequests)}회 · 읽은 응답 본문 ${bytes(initial?.responseBodyBytes)} · 확인된 네트워크 전송량 ${initial?.transferSamples>0?bytes(initial.observedTransferBytes):'미확정'}.</p>`;
 body+=detail('이번 로딩 준비 파일 · 캐시 확인 내역',`<p>준비 단계에서 확인한 파일입니다. 모든 Babylon 로더 읽기나 실제 네트워크 요청 목록을 의미하지 않습니다. 캐시 확인과 다운로드를 구분하며, 공통 플레이어 등 이전 맵에서 재사용한 자원은 위 상주 목록에서 확인합니다.</p>`+table(['파일','종류','논리 용량','상태','최초 확인 / 재사용','이후 확인 / 재사용'],prep.files.map(r=>[r.path,kinds[r.kind]??r.kind,bytes(r.logicalBytes),statuses[r.status]??r.status,`${r.phases.initial?.requestedFiles??0} / ${r.phases.initial?.preparedReuses??0}`,`${r.phases.streaming?.requestedFiles??0} / ${r.phases.streaming?.preparedReuses??0}`])));
 body+=detail('압축 다운로드 묶음',table(['파일','압축 용량','내부 파일 용량','파일 수','상태'],prep.bundles.map(r=>[r.path,bytes(r.compressedBytes),bytes(r.unpackedBytes),r.memberCount,statuses[r.status]??r.status])));
 if(prep.dropped.files||prep.dropped.bundles)body+=`<p>파일 목록 상한 초과 ${number(prep.dropped.files)}회 · 묶음 ${number(prep.dropped.bundles)}회. 합계 카운터는 계속 기록합니다.</p>`;
 }
 body+=`<p>모델 준비 중 ${number(report.pending?.geometry)}개 · 텍스처 준비 중 ${number(report.pending?.textures)}개. ${report.kind==='load-ready'?'진입 직후의 기록입니다. 이후 스트리밍·소환은 “지금 다시 집계”로 비교하세요.':'버튼을 누른 시점의 기록입니다.'} 측정을 위해 추가 렌더·GPU 대기·리소스 다운로드를 하지 않습니다.</p>`;
 if(report.loading)body+=detail('로딩 단계별 시간',table(['단계','시간'],['setupMs','downloadMs','modelMs','screenMs','totalMs'].map(key=>[key,Number.isFinite(report.loading[key])?`${report.loading[key].toFixed(1)} ms`:'미확정'])));
 return body;
}

export function mapResourceReportHtml(report){
 return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonForest 맵 리소스</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#101d19;color:#e7e6d7;max-width:1300px;margin:auto;padding:24px}h1,h3,summary{color:#e6c887}details{margin:18px 0;padding:12px;border:1px solid #4c6358}summary{cursor:pointer}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #42544b;padding:9px;overflow-wrap:anywhere}th{background:#20362c}.map-resource-table{overflow:auto}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}dd{font-size:22px;margin:4px 0}small{color:#b9c5bd}</style><h1>MoonForest · 맵 로딩 리소스</h1>${mapResourceReportMarkup(report)}</html>`;
}

/** Retains one completed load and one manual snapshot, with no frame observer. */
export function createMapResourceInspector({doc=document,getWorld,getLoad=()=>null,collect=snapshotMapResourceInventory,loadCatalog=()=>import('./asset-catalog.js').then(m=>m.ASSET_CATALOG),urlApi=globalThis.URL,BlobType=globalThis.Blob}={}){
 const get=id=>doc.getElementById(id),host=get('map-resource-report'),status=get('map-resource-status');
 let generation=0,initial=null,current=null,selected=null,catalog=null,disposed=false;const urls=new Map();
 function releaseUrls(){for(const url of urls.values())urlApi.revokeObjectURL(url);urls.clear();for(const id of ['map-resource-json-link','map-resource-html-link']){const link=get(id);if(link){link.removeAttribute('href');link.hidden=true;}}}
 function statusText(value){if(status)status.textContent=value;}
 function buttons(){for(const id of ['map-resource-json','map-resource-html'])if(get(id))get(id).disabled=!selected;}
 function begin(){generation++;initial=null;current=null;selected=null;releaseUrls();if(host)host.textContent='이 맵의 로딩이 완료되면 기록됩니다.';statusText('로딩 준비 중');buttons();}
 function capture(kind){
  const world=getWorld();if(!world?.scene)return null;
  const report={version:1,format:'moonforest-map-load-resources',mapId:world.mapId,kind,createdAt:new Date().toISOString(),frameCounter:{source:'last-engine-frame-at-capture',frameId:world.scene.getEngine?.()?.frameId??null},pending:{geometry:world.environment?.geometryPending??0,textures:world.environment?.highTexturePending??0},loading:structuredClone(getLoad()),preparation:world.resourceLoadLedger?.snapshot?.()??null};
  try{report.inventory=collect(world.scene,{world,mapId:world.mapId,renderMetrics:{submittedTriangles:world.scene.getActiveIndices?.()/3},limit:1024});report.placementInputs=captureMapPolygonInputs(world);if(catalog)report.placementEstimate=estimateMapPolygonInputs(report.placementInputs,catalog);}catch(error){report.error=String(error.message).slice(0,300);}
  return report;
 }
 function captureReady(){try{getWorld()?.resourceLoadLedger?.markReady?.();initial=capture('load-ready');current=null;selected=null;buttons();statusText(initial?'이번 로딩 완료 기록이 준비되었습니다.':'맵 기록 없음');}catch(error){statusText('리소스 집계 실패: '+error.message);}}
 async function show(kind='initial'){
  if(disposed)return;const ticket=generation,world=getWorld(),map=world?.mapId;
  if(kind==='current')current=capture('manual');selected=kind==='current'?current:initial;releaseUrls();buttons();
  if(!selected){statusText('완료된 로딩 기록이 없습니다.');return;}
  const report=selected;if(host)host.innerHTML=mapResourceReportMarkup(report);statusText('에셋 이름·배치별 기여도를 준비합니다…');
  try{catalog??=await loadCatalog();if(disposed||ticket!==generation||world!==getWorld()||map!==getWorld()?.mapId||report!==selected)return;
   if(report.placementInputs)report.placementEstimate=estimateMapPolygonInputs(report.placementInputs,catalog);
   if(host)host.innerHTML=mapResourceReportMarkup(report);statusText(kind==='current'?'지금 시점 집계 완료':'이번 로딩 완료 시점 기록');
  }catch(error){if(!disposed&&ticket===generation&&selected===report)statusText('상주 기록은 표시했습니다. 배치 이름 조회 실패: '+error.message);}
 }
 function download(type){
  if(!selected||disposed)return;try{
   const id=type==='json'?'map-resource-json-link':'map-resource-html-link',link=get(id),old=urls.get(type);
   if(old)urlApi.revokeObjectURL(old);
   const content=type==='json'?JSON.stringify(selected,null,2):mapResourceReportHtml(selected),url=urlApi.createObjectURL(new BlobType([content],{type:type==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8'}));urls.set(type,url);
   if(link){link.href=url;link.download=`moonforest-resources-${selected.mapId}-${selected.createdAt.replace(/[:.]/g,'-')}.${type}`;link.hidden=false;link.click();statusText('아래 저장 링크를 다시 눌러 받을 수 있습니다.');}
  }catch(error){statusText('파일 만들기 실패: '+error.message);}
 }
 const listeners=[];function on(id,type,fn){const node=get(id);if(node){node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));}}
 on('map-resource-initial','click',()=>show());on('map-resource-current','click',()=>show('current'));on('map-resource-json','click',()=>download('json'));on('map-resource-html','click',()=>download('html'));
 on('diagnostic-map-resources','toggle',()=>{if(get('diagnostic-map-resources').open&&!selected)void show();});
 on('open-map-resources','click',()=>{get('diagnostic-expand')?.click();const details=get('diagnostic-map-resources');if(details){details.open=true;details.scrollIntoView?.({block:'start'});}void show();});
 buttons();return {begin,captureReady,show,snapshot:()=>structuredClone(selected??initial),dispose(){disposed=true;generation++;releaseUrls();for(const off of listeners)off();initial=current=selected=null;}};
}
