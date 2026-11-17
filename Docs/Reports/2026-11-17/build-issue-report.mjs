import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ownerIssues} from './issue-report-owner-additions.mjs';
import {applyImplementations} from './issue-report-implementation.mjs';

const root=resolve(import.meta.dirname,'../../..');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const inventory=JSON.parse(readFileSync(resolve(root,'ArcherPreviewSite/deployment-files-moonforest-0.2.json'),'utf8'));
const currentBundle=inventory.files.find(row=>/^assets\/moonforestV2-[^/]+\.js$/.test(row.path))?.path.split('/').pop()??'빌드 목록 확인 필요';
const report=(name)=>`Docs/Reports/2026-11-16/${name}.html`;
const latest='Docs/Reports/2026-11-17/MOONFOREST_성능기록_비교분석.html';
const applied=report('MOONFOREST_종합최적화_R2_1차_적용결과');
const shaders=report('MOONFOREST_공통셰이더_준비개선_결과');
const plan=report('MOONFOREST_품질유지_종합최적화_실행계획_R2_2026-11-16');
const r7=report('MOONFOREST_주시떨림_성능기록_R7');
const audio='Docs/Reviews/2026-11-17/MOONFOREST_몬스터_음향_R2_비교검수.html';
const statuses={observed:'문제 관측',partial:'일부 적용',verify:'조치 후 확인 필요',review:'사용자 검수 대기',planned:'조건부 개선',process:'운영 개선',reproduced:'조건부 경로 재현',risk:'정책·조건부 위험',design:'완성도 보완',implemented:'구현·자동검사 완료'};
const issues=[
 {id:'MF-01',title:'모바일 60FPS 유지와 장시간 안정성',category:'성능',priority:1,status:'observed',
 current:'최근 대평원 기록에 지속적인 프레임 부담이 남아 있습니다. 현재 HEAD에서 같은 수준으로 재현된다고 확정한 것은 아닙니다.',
 evidence:['R7 기록: 평균 36.70FPS, 평균 CPU 작업 24.498ms. 목표 60FPS의 프레임 간격은 약 16.7ms입니다.','이전 기록의 평균은 50.55FPS였으나 경로·전투·시점·온도가 달라 패치 회귀나 발열 제한을 입증한 A/B 비교가 아닙니다. 최신 기록도 약 200초여서 장시간 안정성을 인증하지 못합니다.'],
 next:['렌더 대상 평가·포즈/행렬·몬스터 갱신의 지속 비용을 먼저 줄입니다.','계측 조건과 맵·카메라·활성 개체 수를 구분해 기존 기록과 비교합니다. 화질이나 폴리곤을 무조건 낮춰 원인을 덮지 않습니다.'],
 done:'동일 조건의 일반 플레이에서 프레임 분포와 후반 성능이 개선되고, 발열·품질·판정의 손실 없이 유지되는 근거가 있을 때 종료합니다.',
 sources:[latest,applied]},
 {id:'MF-02',title:'200ms급 순간 멈춤의 잔여 원인',category:'성능',priority:1,status:'observed',
 current:'큰 단발 정체가 최근 로그에도 있습니다. 이전 셰이더 준비 수정만으로 전체 원인이 해결됐다고 볼 수 없습니다.',
 evidence:['R7 최대 프레임 간격 212.4ms, 최대 CPU 작업 190.6ms. 약 164.97초에서 장면 117.2ms·렌더 대상 선별 49.2ms·드로 제출 44.9ms·몬스터 갱신 54.5ms가 함께 커졌습니다. 이 시간들은 포함 관계가 있어 합산하면 안 됩니다.','해당 구간은 texture work=idle, 모델/텍스처 대기 0입니다. GPU 타이머는 미지원이며 GC·드라이버·스케줄링 중 하나로 원인을 확정할 수 없습니다.'],
 next:['같은 프레임의 직접 호출·갱신 경로와 메모리/준비 상태를 맞춰 원인 후보를 좁힙니다.','새 근거 없이 셰이더·업로드·AI 중 하나를 반복 수정하지 않습니다. 식별한 경로 하나에 작은 패치를 적용합니다.'],
 done:'관련 정체의 발생 빈도·최대 작업량이 줄어들고, 어느 경로를 줄였는지 설명 가능한 근거를 남깁니다. 평균 FPS 개선만으로 종료하지 않습니다.',
 sources:[latest,shaders]},
 {id:'MF-03',title:'캐시 맵 이동·몬스터 첫 등장 대기',category:'성능',priority:1,status:'verify',
 current:'캐시 상태의 맵 이동 2~3초 목표와 가까운 무리의 빠른 첫 등장에 대한 최신 실기기 완료 근거가 부족합니다.',
 evidence:['이전 CFNpDlIN 빌드 기록에는 네트워크 0B 이동도 5.32초·4.78초였습니다. 모델 2.38/2.17초, 준비·해제 구간 1.23/1.19초 등이 포함됐습니다. 이 수치를 최신 HEAD의 실측으로 취급하지 않습니다.','현재 가까운 무리부터 연속 준비해 그룹 ready 즉시 공개하고, 초기 45초 대기는 제거된 상태입니다. 45초는 리젠에만 사용합니다.','더 오래된 49.20초 model timeout 이력은 있습니다. 최신 R7에서 재발했다고 확인된 것이 아니라, 공통 준비 수정 이후 해소 여부가 미확인인 이력입니다.'],
 next:['네트워크·모델 생성·셰이더/첫 업로드·이전 맵 해제를 구분해 입장 대기의 지배 구간부터 줄입니다.','가까운 무리가 먼저 보이는 정책과 취소/늦은 결과 정리를 보존합니다.'],
 done:'캐시 이동 목표와 가까운 무리의 등장 시점이 기기 기록으로 확인되고, 왕복 이동·취소·실패 재시도에서 늦은 개체가 새 맵에 붙지 않아야 합니다.',
 sources:[report('MOONFOREST_R2_늑대전투_실측분석_2026-11-16'),'ArcherPreview/src/plains-monster-spawns.js','AGENTS.md']},
 {id:'MF-04',title:'공유 자원·휴면 풀의 통합 메모리 예산',category:'자원·렌더',priority:2,status:'partial',
 current:'부분 예산과 자원 장부는 있지만, 몬스터·NPC·컷씬·배경·대기 업로드를 모두 묶는 강제 상주 예산은 아직 없습니다.',
 evidence:['최근 종료 JS 힙 추정은 약 624MB입니다. 골격 8→21, 등록 배치 19개체는 준비 진행과 양립하므로 그 증가만으로 누수라고 판단하지 않습니다.','ActorPopulation·소유자별 contentRuntime 관측·맵 자원 목록·휴면 수동 복제 합계 12개 목표 trim은 구현돼 있습니다. 이는 전체 RAM/GPU 메모리 상한이 아닙니다.','플레이어 동작 캐시 2→4는 생성량을 줄인 대신 보존 바인딩 1,224→2,040으로 늘었습니다. 생성량 감소와 상주 비용 증가를 함께 봐야 합니다.'],
 next:['공유 원본과 개체별 자원, CPU 페이로드·GPU 추정·예약량을 분리해 소유권과 해제 시점을 통합합니다.','맵 왕복과 소환·제거에서 현재 살아 있는 자원과 누적 생성 카운터를 구분합니다. 집·보스 원본과 승인 텍스처는 보존합니다.'],
 done:'소유자별 활성·휴면·준비 비용과 반환/해제 시점이 일치하며, 반복 후 잔존량을 설명할 수 있어야 합니다. 정확한 GPU RAM을 측정한 것처럼 표시하지 않습니다.',
 sources:[latest,applied,'ArcherPreview/src/content-runtime-budget.js','ArcherPreview/src/dormant-encounter-pool.js']},
 {id:'MF-05',title:'풍경·포즈·주시 갱신의 남은 반복 비용',category:'성능',priority:2,status:'partial',
 current:'이미 줄인 반복 비용을 보존하면서, 평상시 프레임에 남는 계산을 더 좁혀야 합니다.',
 evidence:['풍경 인덱스·투영 결과 재사용, 개체 간 공간 후보, 바인딩 캐시 등은 구현돼 있습니다. 이를 미구현으로 다시 작업하면 안 됩니다.','최신 느린 표본에는 렌더 대상 선별 최대 55.8ms, 플레이어 애니메이션 최대 55.0ms가 남습니다. 큰 반경의 전체 장애물 순회와 주시각 피드백 진동은 R7에서 수정된 경로입니다.'],
 next:['같은 프레임에서 동일 포즈·행렬·가시성·비전투 주시 계산을 여러 소비자가 반복하는지 좁게 확인합니다.','표현 갱신과 전투 타이밍을 구분하고, 기존 충돌·타격·이벤트 정확도를 보존합니다.'],
 done:'바뀐 계산 경로의 호출량과 CPU 비용이 줄고, 동작·접촉 결과가 유지돼야 합니다. 생성 카운터 감소만으로 FPS 개선을 선언하지 않습니다.',
 sources:[latest,r7,applied,'ArcherPreview/src/frame-work-coordinator.js']},
 {id:'MF-06',title:'불필요한 지형·정적 배경 제출 줄이기',category:'자원·렌더',priority:3,status:'planned',
 current:'추가 thin instance와 지형 분할은 아직 조건부 계획입니다. 기존 인스턴싱과 공용 컬링은 이미 적용돼 있습니다.',
 evidence:['R7 종료 제출 삼각형은 1,264,468, draw call은 145입니다. 외곽선·그림자 등 반복 패스가 포함돼 보이는 고유 모델 삼각형 수와 같지 않습니다.','terrain-mesh.js의 지형 생성은 단일 ground 메시 경로입니다. 추가 정적 소품 묶기 W04·지형 분할 W05는 1차 적용 결과에서도 미적용으로 남아 있습니다.'],
 next:['대평원 한 구역의 작은 시범에서 화면 밖 제출 감소와 draw call 증가를 비교합니다.','같은 셀·자산·재질·LOD·렌더 패스만 묶고, 편집 ID·충돌·상자 상태와 원래 지형 높이/UV/노멀을 유지합니다.'],
 done:'같은 장면의 실제 CPU·제출·프레임 비용이 유리하고 경계 이음·편집·판정 손실이 없을 때만 확대합니다. 현재 숫자만 보고 맵 전체를 재구성하지 않습니다.',
 sources:[applied,plan,'ArcherPreview/src/terrain-mesh.js','ArcherPreview/src/village-instancing.js']},
 {id:'MF-07',title:'최초 GPU 준비·서로 다른 로더 작업의 집중',category:'자원·렌더',priority:2,status:'partial',
 current:'공유 2ms 협력 예산과 공통 셰이더 준비는 있습니다. 긴 원자 호출과 로더 사이의 동시 자원 입장은 별도 문제로 남습니다.',
 evidence:['R7 첫 4K 업로드 한 건은 56.3ms였습니다. 필수 SDK 컴파일·버퍼/텍스처 호출은 중간에 강제로 잘라 실행할 수 없습니다.','공통 prepareModelShaders와 prepared-effect 수명 보존은 구현됐습니다. 2ms는 협력 목표이며 모든 호출의 강제 최대 시간이 아닙니다.','플레이어·배경·배우·컷씬의 준비 우선순위와 대기 버퍼를 함께 제한하는 교차 로더 admission은 미적용입니다.'],
 next:['준비 구간의 긴 단일 호출과 동시에 겹치는 작업을 구분합니다.','필수 첫 화면·가까운 개체를 우선하고, 후순위 준비와 대기 업로드가 동시에 몰리지 않도록 작은 범위의 입장 제어부터 도입합니다.'],
 done:'최초 준비의 긴 프레임과 입장 대기가 함께 줄고, 준비 누락·취소 실패·새 맵에 늦은 결과 게시가 없어야 합니다.',
 sources:[latest,shaders,applied,'ArcherPreview/src/frame-work-coordinator.js','ArcherPreview/src/boss-shader-warmup.js']},
 {id:'MF-08',title:'캐시·디코더의 해제와 재준비 반복',category:'자원·렌더',priority:3,status:'planned',
 current:'보존 시간을 늘리는 실험은 아직 기본 정책에 적용하지 않았습니다. 메모리와 재준비 비용을 함께 비교해야 합니다.',
 evidence:['현재 고해상도 텍스처의 수요 종료 후 해제 기준은 모바일 12초/PC 20초, KTX 유휴 8초, meshopt 유휴 1초 정책입니다.','디코더·고해상도 캐시의 제한된 준비 세션 보존 W11은 조건부 후속입니다. 오래 유지할수록 무조건 유리하다고 판단한 상태가 아닙니다.'],
 next:['같은 왕복 이동에서 제한된 lease/LRU 후보 하나를 현재 정책과 비교합니다.','상주+예약 예산, context loss/timeout 복구, 준비 종료와 최종 해제를 함께 유지합니다.'],
 done:'재생성·재업로드를 줄이면서 메모리 고착과 복구 실패가 늘지 않을 때 채택합니다.',
 sources:[applied,plan,'AGENTS.md']},
 {id:'MF-09',title:'기록 ON/OFF 체감 차이·GPU 원인 구분',category:'성능',priority:2,status:'verify',
 current:'기록을 켜야 최적화가 실행되는 분기는 발견되지 않았습니다. 실제 기기에서 기록할 때 더 부드럽다는 체감의 원인은 미해명입니다.',
 evidence:['NullEngine의 OFF/기본/기록/상세 기록 4상태에서 드로 인수·가시성·변환·렌더 크기·예산의 동등성과 훅 해제 복원을 확인했습니다.','GPU timer는 미지원입니다. 최신 진단 평균 0.10ms는 프레임 끝 동기 수집 부분만 뜻하며 상세 래퍼를 포함한 계측 총비용이 아닙니다.'],
 next:['기존 기록 자료에서 준비 완료·캐시·일시정지 전후·해상도·개체 수를 맞춰 해석합니다.','평소에도 상세 계측을 강제로 켜는 우회는 하지 않습니다. 필요한 짧은 상세 표본과 전체 프레임 집계를 구분합니다.'],
 done:'일반 플레이에 동일한 개선이 적용됨을 유지하고, 체감 차이를 설명하는 근거가 생겨야 합니다. 지원되지 않는 GPU 시간을 0으로 표시하거나 CPU 시간에 합치지 않습니다.',
 sources:[latest,shaders]},
 {id:'MF-10',title:'최근 몬스터·전투 수정의 외형 확인',category:'조작·품질',priority:2,status:'verify',
 current:'주시 떨림·턱 방향·풍경 겹침·곰 보속/접촉 등은 수정된 코드가 있습니다. 최신 전체 동작의 사용자 시각 승인은 별도로 남습니다.',
 evidence:['R7은 누운 경계 원형 포즈 복원과 머리/목 주시각의 피드백 문제, 큰 배우 길찾기 후보 비용을 수정했습니다. 원래 몸 방향·골격 길이를 보존합니다.','안전 배회·풍경 여유 반경·곰의 실제 스킨 접촉과 보속 연결도 현재 구현입니다. 이 사실을 모든 카메라·모든 상황에서 자연스러움이 승인됐다는 뜻으로 확대하지 않습니다.'],
 next:['현재 수정본의 누운 주시·걷기/달리기·피격·넘어짐·돌진 연결을 같은 시점에서 짧게 비교합니다.','새 시각 문제가 발견된 동작만 고치고, 승인된 다른 클립·뼈 스케일·웨이트를 넓게 다시 바꾸지 않습니다.'],
 done:'머리 파묻힘·떨림·지면 미끄러짐·팔다리 늘어짐과 타격 불일치가 목표 구간에서 없는 검수 결과를 남깁니다. 과거 버그를 재현 없이 다시 미해결로 단정하지 않습니다.',
 sources:[r7,'AGENTS.md','ArcherPreview/src/wolf-v02-encounter.js','ArcherPreview/src/boss-encounter.js']},
 {id:'MF-11',title:'HUD 편집·저장·창 크기 변경의 사용성',category:'조작·품질',priority:3,status:'verify',
 current:'실화면 드래그·모서리/두 손가락 크기 조절·초기화·JSON 다운로드는 구현돼 있습니다. 예전 실패가 현재도 재현된다고 확인한 것은 아닙니다.',
 evidence:['hud-layout.js에는 저장과 별개로 JSON 다운로드 링크를 유지하는 복구 경로가 있고, 컴포넌트의 최대 크기는 5배까지 허용합니다.','자동 화면 비례 배율과 사용자가 저장한 상대 위치/크기의 관계는 PC 창 크기 변경·모바일 방향 변경·파일 재가져오기에서 이어서 확인할 품질 항목입니다.'],
 next:['현재 구현을 기준으로 기존 실패 흐름만 짧게 확인하고, 버튼 배치·미저장 상태·파일 열기 실패가 사용자에게 명확한지 정리합니다.','가방·의뢰·이야기·설정과 개발 도구의 겹침/닫기를 필요한 범위에서 함께 확인합니다.'],
 done:'저장→내보내기→다시 가져오기와 화면 변경 뒤 배치가 유지되고, 게임 입력이 편집 상태와 섞이지 않아야 합니다. 이 보고서에서 새 결함을 재현한 항목은 아닙니다.',
 sources:['ArcherPreview/src/hud-layout.js','ArcherPreview/src/hud-layout.css','ArcherPreview/src/editor-workspace.js']},
 {id:'MF-12',title:'종별 고유 효과음·우두머리 테마 승인',category:'음향',priority:2,status:'review',
 current:'현재 늑대·여우·멧돼지의 주요 발성은 곰 소리를 공유하고, 우두머리 늑대도 공용 보스곡을 사용합니다. R2는 검수본만 있으며 게임 미적용입니다.',
 evidence:['action-audio.js의 goblin/bear 분기와 boss-music.js의 공용 boss 선택이 현재 실제 연결입니다. R1 효과음 44개·곡은 사용자 검수에서 제외돼 롤백됐습니다.','R2는 녹음 기반 효과음 16개와 실제 악기 샘플 기반 신곡 1곡, 현재 소리와의 비교·15초 맥락 비교를 담은 단일 HTML입니다. 기본 디코딩·수치·스크립트 확인은 청감 승인과 다릅니다.','늑대 전투 발성은 개 녹음을 가공한 후보, 울음은 실제 늑대, 여우는 실제 여우, 멧돼지는 돼지 녹음 기반입니다. 같은 톤·연주/믹싱 완성도가 확보됐다고 확정하지 않았습니다.'],
 next:['효과음과 전투곡을 별도로 선별하고, 제외된 R1을 재연결하지 않습니다.','승인된 항목만 게임 이벤트·동시 음성·거리·반복 간격에 연결합니다. 곰·고블린·엘레나·기존 지역 음악을 일괄 교체하지 않습니다.'],
 done:'사용자 청감 승인 후 연결하고, 실제 전투 시작 음악 조건과 맵 이동/해제 수명까지 유지할 때 종료합니다.',
 sources:['ArcherPreview/src/action-audio.js','ArcherPreview/src/boss-music.js','Sources/audio/creatures-r2-review-2026-11-17/review-build.json',audio]},
 {id:'MF-13',title:'마을 음악의 YouTube 차단 후속 처리',category:'음향',priority:1,status:'observed',
 current:'사용자 메일에서 Echoes Of Home / We Are Era Music AB / Shorts 전 세계 차단이 확인됐습니다. 해제 또는 자체 곡 전환이 완료됐다는 근거는 없습니다.',
 evidence:['기존 출처 감사는 공식 CC BY 4.0 사용 근거와 크레딧 파일을 확인했습니다. 이용 허용과 Content ID의 자동 주장은 서로 다른 문제입니다.','감사 문서는 메일을 받기 전 작성돼 “신고 상세 미제공”이라고 적혀 있습니다. 이 보고서는 이후 사용자 제공 메일을 반영합니다. 실제 업로드 설명란과 해제 결과는 확인하지 않았습니다.','마을·대평원은 같은 village 곡을 사용하고, 등장·승리 등 짧은 전환음에도 기존 곡 편집이 있어 BGM만 바꾸면 모든 관련 음원이 사라진다고 가정할 수 없습니다.'],
 next:['영상에 실제 사용한 곡과 크레딧을 맞추고 기존 주장 후속 상태를 정리합니다. 이 보고서는 이의 제기나 해제 신청을 대신 수행하지 않습니다.','장기적으로 자체 곡 또는 방송 친화 음원 정책을 정하되 새 음악도 먼저 HTML 청감 검수를 거칩니다.'],
 done:'기존 영상 차단의 처리 결과와 향후 영상/방송용 음악·출처 정책을 구분해 확정합니다. 무신고·법률적 무위험을 보장하는 항목은 아닙니다.',
 sources:[report('MOONFOREST_BGM_저작권_검토_2026-11-16'),'Docs/Reports/2026-11-16/YouTube_마을영상_음악출처.txt','ArcherPreview/src/boss-music.js'],
 extraEvidence:'사용자 제공 YouTube 안내 메일 이미지: Echoes Of Home — Scott Buckley, Content owners We Are Era Music AB, Blocked globally.'},
 {id:'MF-14',title:'공용 코드의 경계와 변경 영향 정리',category:'제작·운영',priority:3,status:'planned',
 current:'기능이 여러 번 확장된 공용 경로는 변경 범위와 소유권을 더 명확히 할 필요가 있습니다. 코드가 길다는 이유만으로 전면 재작성할 과제는 아닙니다.',
 evidence:['main.js는 약 135KB이며 입력·설정·로딩·맵/배우 연결을 함께 조정합니다. 파일 크기 자체를 렌더링 병목의 증거로 사용하지 않습니다.','공통 셰이더·자원 장부·휴면 풀·프레임 조정기 등 이미 분리된 모듈은 있습니다. 기존 분리를 무시한 새 프레임워크를 겹쳐 넣지 않아야 합니다.'],
 next:['원인 조사에서 실제로 수정이 잦은 경계 하나를 골라 공개 계약과 수명/취소 책임을 명시합니다.','로직 정리와 성능·전투 기능 변경을 같은 패치에 섞지 않고, 대표 경로 하나를 이전한 뒤 확대합니다.'],
 done:'같은 입력/저장/맵 이동/전투 결과를 보존하고, 영향을 받는 파일과 검사를 설명할 수 있을 때 한 단계씩 종료합니다.',
 sources:['ArcherPreview/src/main.js','ArcherPreview/src/boss-models.js','ArcherPreview/src/frame-work-coordinator.js','AGENTS.md']},
 {id:'MF-15',title:'새 NPC·컷씬·마법 효과의 비용 여유 확보',category:'콘텐츠 확장',priority:3,status:'partial',
 current:'공용 준비·제한된 컷씬 호스트·수동 이펙트 검수 경로는 있지만, 화려한 실제 전투 마법과 콘텐츠별 동시 비용 기준은 후속입니다.',
 evidence:['effect-world.js는 유한 슬롯의 수동 화염 충격파 검수본입니다. 실제 스킬 피해·상태·공격 예고가 이미 구현된 것으로 취급하지 않습니다.','컷씬 scene host와 기존 카메라/프레임 재사용은 구현돼 있습니다. 고품질 원본·다음 컷 배우·현재 게임 배우가 함께 상주할 때의 총비용까지 인증된 것은 아닙니다.','새 몬스터·NPC 제작 가이드는 있습니다. 권고 삼각형·텍스처 수치를 승인된 기존 자산에 소급 적용하는 일괄 감량 규칙은 아닙니다.'],
 next:['필수 공격 예고/판정과 장식 효과를 구분하고 동시 수·화면 중첩·수명·빛/그림자·텍스처/프로그램 예산을 정의합니다.','콘텐츠 하나씩 실제 자원 소유권·준비·seek/skip/복귀·해제를 확인한 뒤 확장합니다.'],
 done:'몬스터·NPC·컷씬·이펙트가 공존하는 대표 장면에서 허용 비용과 품질을 확인합니다. 도구에서 20마리를 허용한다는 사실을 모바일 전투 지원 인증으로 쓰지 않습니다.',
 sources:['ArcherPreview/src/effect-world.js','ArcherPreview/src/cinematic-scene-host.js',applied,'AGENTS.md']},
 {id:'MF-16',title:'30분 작업·반복 재수정 줄이기',category:'제작·운영',priority:2,status:'process',
 current:'첫 결과가 늦고 재수정이 반복된다는 사용자 지적이 남아 있습니다. 빠른 검수 공유 규칙은 있으나 운영 성과가 충분하다고 확인된 상태는 아닙니다.',
 evidence:['사용자 피드백은 모델 작업의 긴 대기·모션/음향 재수정·수치 확인과 실제 완성도의 차이를 반복 지적했습니다. 30분은 사용자 체감 설명이며 전체 작업의 통계 평균을 측정한 값이 아닙니다.','AGENTS.md에는 이미 빠른 검수본 우선·기본 동작 필수 확인·음향 승인 후 반영 규칙이 있습니다. 새 지침을 늘리는 것만으로 개선이 입증되지는 않습니다.'],
 next:['작업마다 기준 커밋·현재 증거·수정 범위·보존 조건·완료 기준을 짧게 인계합니다.','어려운 대표 수정은 판단이 좋은 담당자가 구현까지 끝내고, 확정된 반복 적용·검사·포장만 별도 담당자에게 넘깁니다.','새 근거 없는 같은 접근의 반복을 중단하고, 첫 작동 결과를 먼저 공유합니다. 광범위 검사와 상세 문서가 결과 공유를 계속 늦추지 않게 합니다.'],
 done:'실제 작업별 첫 결과까지의 시간·재수정 횟수·사용량·최종 승인 여부를 남겨 이전보다 나아졌는지 판단합니다. 이번 보고서는 모델 혼용 시스템을 설치한 결과가 아닙니다.',
 sources:['AGENTS.md'],extraEvidence:'본 대화의 사용자 피드백 및 Codex/Claude 혼용 운영 논의.'},
];
const existing=[
 ['공통 셰이더 준비·프로그램 수명','플레이어·몬스터·NPC·컷씬 공통 준비와 제한된 참조 보존은 구현. 모든 기기의 순간 멈춤 제거 인증은 아님.'],
 ['배우 컬링·내부선 유휴·그림자 일부 제외','공용 카메라 경계·내부선 버퍼 재사용·기존 거리 밖 배우의 그림자 제외는 구현. 추가 광원 볼륨 선별은 조건부 후속.'],
 ['주시 떨림·큰 배우 탐색 비용','R7에 수정 있음. 최신 외형 확인을 MF-10으로 관리하며 과거 버그의 현재 재발을 단정하지 않음.'],
 ['배치 무리 준비 순서·영역 상태','가까운 무리 우선·초기 대기 제거·경계→전투 상태와 HP/음악 게이트 구현. 등장 속도의 실기기 목표는 MF-03으로 별도 관리.'],
 ['HUD 실화면 편집·500%·JSON','실화면 선택·크기 조절·초기화·다운로드 구현. 과거 실패를 MF-11에서 품질 확인 대상으로 관리.'],
 ['음향 R1 롤백·전투 시작 음악','미승인 R1은 게임에서 철회. 전투 확인 게이트는 구현. R2는 검수 자료로만 보존.'],
];
for(const row of ownerIssues)issues.push({...row,status:row.status==='source'?'reproduced':row.status,ownerAdded:true});
applyImplementations(issues);
const allSources=[...new Set(issues.flatMap(x=>x.sources))];
const sourceMeta=allSources.map(path=>{
 const full=resolve(root,path);if(!existsSync(full))throw Error('Missing evidence '+path);
 const bytes=readFileSync(full);return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
const data={date:'2026-11-17',timezone:'Asia/Seoul',head,statuses,issues,ownerAudit:{added:ownerIssues.length,conditionalCodePathTypes:4,noRealSaveTouched:true},
 latestMeasurement:{bundle:'moonforestV2-ZmTCMIYY.js',localBundle:'moonforestV2-ERbQVS8V.js',dateKst:'2026-11-17 00:46:33–00:49:53',frames:6335,meanFps:36.70,maxFrameMs:212.4,meanCpuMs:24.498,jsHeapReportedApprox:'약 624MB (기록 표기)'},
 sourceMeta,implementation:{applied:['MF-05','MF-07','MF-17','MF-18','MF-19','MF-20','MF-21','MF-24','MF-25'],previousSaveReleaseTests:63,focusedPerformanceTests:29,navigationCompatibilityTests:24,build:currentBundle,realDeviceTested:false,browserAutomation:false},scope:'Code audit with post-audit save/reward/startup/deployment fixes, then scenery/A*/culling/shader CPU hotpath fixes. Counts are per focused test batch, not summed unique tests or device performance. No real user save modification or fresh device tests.'};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=items=>'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
const priority={1:'먼저',2:'다음',3:'후속'};
const cards=issues.map(x=>`<details class="issue" id="${x.id}" data-category="${esc(x.category)}" data-status="${x.status}" data-priority="${x.priority}"><summary><span class="code">${x.id}</span><span class="title">${esc(x.title)}</span><span class="status ${x.status}">${statuses[x.status]}</span><span class="priority p${x.priority}">${priority[x.priority]}</span></summary><div class="body"><p class="current">${esc(x.current)}</p><div class="columns"><section><h3>확인한 근거</h3>${list(x.evidence)}${x.extraEvidence?'<p class="extra">'+esc(x.extraEvidence)+'</p>':''}</section><section><h3>다음 조치</h3>${list(x.next)}<h3>완료 기준</h3><p>${esc(x.done)}</p></section></div><div class="source"><b>근거 자료</b>${x.sources.map(s=>'<code>'+esc(s)+'</code>').join('')}</div><button class="copy" data-copy="${x.id}">이 항목 인계문 복사</button><span class="copy-status" aria-live="polite"></span></div></details>`).join('\n');
const categories=[...new Set(issues.map(x=>x.category))];
let html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoonForest · 미해결 문제와 개선 과제 · 2026-11-17</title><style>
:root{color-scheme:light;--paper:#f3f2ec;--ink:#22352d;--muted:#637368;--line:#d7ded4;--green:#285640}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 system-ui,-apple-system,'Malgun Gothic',sans-serif}header,main,footer{max-width:1150px;margin:auto;padding:28px}header{padding-top:44px}.eyebrow{font-size:11px;letter-spacing:.15em;font-weight:750;color:var(--green)}h1{font-size:clamp(27px,4.7vw,40px);letter-spacing:-.045em;line-height:1.3;margin:10px 0 14px}h2{font-size:20px;margin:0 0 10px}h3{font-size:13px;color:var(--green);margin:14px 0 5px}p{margin:8px 0 14px}.muted,small{color:var(--muted)}.lead{max-width:900px}.meta{font-size:12px;color:var(--muted)}code{font:12px/1.5 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.note{background:#e9eee4;border-left:3px solid #819b76;padding:12px 15px;border-radius:0 7px 7px 0;font-size:13px}.counts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0 15px}.metric{border:1px solid var(--line);border-radius:9px;background:#fff;padding:15px}.metric b{display:block;font-size:26px;font-weight:720;line-height:1.35}.metric span{font-size:12px;color:var(--muted)}.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:14px 0}.toolbar input{flex:1;min-width:190px}.toolbar input,.toolbar select,button{font:inherit;color:inherit;background:white;border:1px solid #b9c7b7;border-radius:6px;padding:9px 12px}button{cursor:pointer;font-size:13px}button:hover{background:#e9efe6}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #8ea775;outline-offset:2px}.subbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}.subbar .result{margin-right:auto;font-size:12px;color:var(--muted)}.issue{background:#fff;border:1px solid var(--line);border-radius:8px;margin:9px 0;overflow:hidden}.issue[open]{border-color:#98ae96}.issue summary{list-style:none;display:flex;align-items:center;gap:12px;padding:16px 17px;cursor:pointer;line-height:1.4}.issue summary::-webkit-details-marker{display:none}.issue summary::after{content:'+';font-size:21px;font-weight:400;color:#647660;min-width:16px;text-align:center}.issue[open] summary::after{content:'−'}.issue summary:hover{background:#f8faf5}.issue[open] summary{border-bottom:1px solid var(--line);background:#f6f9f2}.code{font:11px ui-monospace,Consolas,monospace;color:#7a897f;min-width:43px}.title{flex:1;font-weight:680;font-size:15px}.status,.priority{white-space:nowrap;border-radius:4px;padding:4px 7px;font-size:10px;font-weight:700}.observed{color:#874332;background:#faeae4}.partial{color:#7a6224;background:#f6f0dd}.verify{color:#365b77;background:#e9eff5}.review{color:#69517e;background:#f0eaf6}.planned{color:#59665c;background:#edf0eb}.process{color:#32634f;background:#e6f0e8}.priority{min-width:33px;text-align:center;color:#777}.p1{color:#843f2b;background:#faeee9}.p2{color:#6d622f;background:#f4f1e7}.p3{color:#6e796b}.body{padding:18px 23px 23px}.current{font-size:15px;font-weight:600;margin-top:0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}.columns p,.columns li{font-size:13px}ul{padding-left:19px;margin:5px 0 14px}li{margin:7px 0}.extra{color:var(--muted)}.source{border-top:1px solid var(--line);padding-top:12px;margin-top:16px;font-size:11px;color:var(--muted)}.source code{display:block;font-size:11px;margin:4px 0}.copy{margin-top:14px;background:#edf3e9;color:var(--green)}.copy-status{font-size:12px;margin-left:8px;color:var(--green)}.panel{background:white;border:1px solid var(--line);border-radius:9px;padding:20px;margin:25px 0}.panel summary{cursor:pointer;font-weight:650}.panel table{width:100%;border-collapse:collapse;font-size:12px}.panel td,.panel th{padding:10px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}.panel th{color:var(--muted)}.tablewrap{overflow:auto}.legend{font-size:12px;color:var(--muted)}.legend b{color:var(--ink)}.empty{padding:28px;background:#fff;text-align:center;border:1px dashed var(--line);border-radius:8px}.hide{display:none!important}footer{font-size:12px;color:var(--muted);padding-top:0}.small{font-size:12px}.recommend{font-size:13px;margin:0}.recommend b{color:var(--green)}@media(max-width:720px){header,main,footer{padding:20px 14px}.counts{grid-template-columns:repeat(2,1fr);gap:8px}.metric{padding:12px}.issue summary{gap:7px;padding:14px 11px;flex-wrap:wrap}.title{flex-basis:calc(100% - 65px);font-size:14px}.status{margin-left:50px}.priority{margin-left:auto}.issue summary::after{font-size:18px}.body{padding:15px}.columns{grid-template-columns:1fr;gap:0}.panel{padding:16px}.toolbar select{max-width:100%}}@media print{body{background:white;font-size:11px}header,main,footer{max-width:none;padding:10px}.toolbar,.subbar,.copy,.copy-status{display:none}.issue{break-inside:avoid}.columns{grid-template-columns:1fr}.counts{margin:10px 0}.body{padding:10px}.source code{font-size:9px}}
</style></head><body>
<header><div class="eyebrow">MOONFOREST 0.2 / ISSUE REGISTER / 2026.11.17</div><h1>남아 있는 문제와<br>다음 개선 과제</h1><p class="lead">항목을 누르면 <b>현재 상태 · 근거 · 다음 조치 · 완료 기준</b>이 펼쳐집니다. 관측된 문제와 미적용 계획, 수정 후 확인할 품질 항목을 구분했습니다.</p><p class="meta">기준: 로컬 HEAD <code>${head.slice(0,7)}</code> · 최신 성능 기록: R7 <code>moonforestV2-ZmTCMIYY.js</code> · 2026-11-17 한국 시간</p><div class="counts"><div class="metric"><b>${issues.length}</b><span>관리 과제 · 현재 결함 개수 아님</span></div><div class="metric"><b>${issues.filter(x=>x.priority===1).length}</b><span>먼저 다룰 항목</span></div><div class="metric"><b>36.70</b><span>최근 기록 평균 FPS</span></div><div class="metric"><b>212.4ms</b><span>최근 기록 최대 프레임 간격</span></div></div><div class="note">최근 실측은 현재 HEAD와 다른 R7 빌드의 대평원 기록입니다. <b>모든 항목이 최신 배포에서 다시 재현됐다는 뜻은 아닙니다.</b> 이번에는 코드·기존 자료만 확인했으며, 게임 수정·재배포·새 실기기 검사·브라우저 자동조작은 하지 않았습니다.</div></header>
<main><p class="recommend"><b>추천 진행:</b> MF-01·02의 지속/순간 비용 분리 → MF-05·07의 근거 있는 최소 수정 → MF-03·04의 준비·상주 비용 정리. 음향·영상 차단은 MF-12·13으로 별도 관리합니다.</p><div class="toolbar"><input id="search" type="search" aria-label="과제 검색" placeholder="검색: 순간 멈춤, 늑대, 메모리…"><select id="category" aria-label="분류"><option value="">모든 분류</option>${categories.map(x=>'<option>'+esc(x)+'</option>').join('')}</select><select id="status" aria-label="상태"><option value="">모든 상태</option>${Object.entries(statuses).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')}</select><select id="priority" aria-label="우선순위"><option value="">모든 순서</option><option value="1">먼저</option><option value="2">다음</option><option value="3">후속</option></select></div><div class="subbar"><span class="result" id="result">${issues.length}개 항목</span><button id="expand">표시 항목 펼치기</button><button id="collapse">모두 접기</button><button id="export">과제 JSON 다운로드</button></div><p class="legend"><b>문제 관측</b>은 기존 로그·사용자 증거가 있는 항목입니다. <b>조치 후 확인 필요</b>는 수정 코드가 있으나 최신 효과·품질의 확인을 완료하지 않은 항목이며, 재발 확정과 다릅니다.</p><div id="issues">${cards}</div><p class="empty hide" id="empty">조건에 맞는 항목이 없습니다.</p>
<details class="panel"><summary>이미 적용된 내용 · 같은 작업을 다시 만들지 않기</summary><p class="small muted">아래 구현을 출발점으로 삼습니다. 구현 존재, 자동 검사 통과, 실기기 효과와 사용자 승인을 같은 의미로 취급하지 않습니다.</p><div class="tablewrap"><table><thead><tr><th>구현</th><th>현재 상태와 한계</th></tr></thead><tbody>${existing.map(([a,b])=>'<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td></tr>').join('')}</tbody></table></div></details>
<details class="panel"><summary>보고서 범위 · 보존 조건 · 장기 아이디어</summary><p class="small">이 보고서는 최신 자료에서 남은 근거가 있는 과제의 현황판입니다. 과거 대화의 모든 요청을 현재 버그로 재등록한 전수 결함 감사가 아닙니다. 새 결함을 발견했다고 표시하지 않은 품질 항목은 재현 검사를 수행하지 않았습니다.</p><p class="small"><b>모든 실제 수정의 기본 조건:</b> 승인된 모델·텍스처·기존 LOD·골격/모션·전투 조작과 판정, 원본/백업과 이식 가능한 canonical 구성을 유지합니다. 브라우저 자동조작을 사용하지 않습니다. 성능 개선 수치는 조건과 분모를 함께 기록합니다.</p><p class="small">마물의 탑·하우징·침공 방어·도플갱어 PvP는 이전에 논의한 장기 콘텐츠 아이디어입니다. 현재 결함이나 이 보고서로 승인된 구현 작업으로 세지 않았습니다. 기존 기획·구현 현황을 별도로 확인한 뒤 범위를 정해야 합니다.</p><p class="small">배포 기준 파일은 <code>moonforestV2-ERbQVS8V.js</code>로 로컬 목록에 남아 있습니다. 이번 보고서 작성 중 실제 웹의 최신 파일·실행 결과를 새로 확인한 것은 아닙니다.</p></details>
<details class="panel"><summary>근거 목록 · 기준 파일 해시</summary><p class="small muted">파일 경로는 프로젝트 안의 추적 정보입니다. 공유받은 사람이 이 파일들을 갖고 있지 않아도 위 상세 본문을 읽을 수 있습니다. R2 음향 검수 HTML은 별도 산출물이며 이 보고서에 오디오는 내장하지 않았습니다.</p><div class="source">${sourceMeta.map(x=>'<code>'+esc(x.path)+'<br>SHA-256 '+x.sha256+'</code>').join('')}</div></details></main><footer>단일 HTML · 외부 이미지/글꼴/스크립트 의존 없음 · 세부 내용은 기본 접힘 · 자료 기준 2026-11-17 · 게임 수정 없음</footer>
<script id="report-data" type="application/json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script><script>
'use strict';const D=JSON.parse(document.getElementById('report-data').textContent),$=id=>document.getElementById(id),cards=[...document.querySelectorAll('.issue')],sourceById=new Map(D.issues.map(x=>[x.id,x]));
function filter(){const q=$('search').value.trim().toLocaleLowerCase(),c=$('category').value,s=$('status').value,p=$('priority').value,onlyNew=$('new-only').checked;let n=0;for(const el of cards){const row=sourceById.get(el.id),match=(!q||JSON.stringify(row).toLocaleLowerCase().includes(q))&&(!c||row.category===c)&&(!s||row.status===s)&&(!p||String(row.priority)===p)&&(!onlyNew||row.ownerAdded);el.hidden=!match;if(match)n++;} $('result').textContent=n+' / '+cards.length+'개 항목';$('empty').classList.toggle('hide',n!==0);}
for(const id of ['search','category','status','priority','new-only'])$(id).addEventListener('input',filter);
$('expand').onclick=()=>cards.filter(x=>!x.hidden).forEach(x=>x.open=true);$('collapse').onclick=()=>cards.forEach(x=>x.open=false);
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({...D,issues:D.issues.filter(x=>!document.getElementById(x.id).hidden)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MoonForest_미해결_개선과제_2026-11-17.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)};
document.addEventListener('click',async e=>{const button=e.target.closest('[data-copy]');if(!button)return;const x=sourceById.get(button.dataset.copy),nl=String.fromCharCode(10),text=['MoonForest 과제 '+x.id+' — '+x.title,'기준 HEAD: '+D.head,'작업 경로: C:/dev/MoonForest. AGENTS.md / README_PORTABLE.md 먼저 확인.','상태: '+D.statuses[x.status],x.current,'근거:'+nl+x.evidence.map(y=>'- '+y).join(nl),'다음 조치:'+nl+x.next.map(y=>'- '+y).join(nl),'완료 기준: '+x.done,'보존: 승인 화질·LOD·골격/모션·전투 조작/판정·원본. 브라우저 자동조작 금지.','자료:'+nl+x.sources.join(nl)].join(nl+nl);let ok=false;try{if(navigator.clipboard){await navigator.clipboard.writeText(text);ok=true}}catch{}if(!ok){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.left='-10000px';document.body.append(area);area.select();try{ok=document.execCommand('copy')}catch{}area.remove();}button.nextElementSibling.textContent=ok?'인계문을 복사했습니다.':'복사가 제한됐습니다. JSON 다운로드를 이용하세요.'});
if(location.hash){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(target?.classList.contains('issue'))target.open=true}
</script></body></html>`;
const out=resolve(import.meta.dirname,'MOONFOREST_미해결문제_개선과제_현황.html');
html=html.replace('관측된 문제와 미적용 계획, 수정 후 확인할 품질 항목을 구분했습니다.','기존 16개에 저장·복구·이야기 완주·출시 관점의 10개를 추가했습니다. 실제 재현한 조건부 경로와 개선 판단을 구분했습니다.');
html=html.replace('<div class="metric"><b>36.70</b><span>최근 기록 평균 FPS</span></div><div class="metric"><b>212.4ms</b><span>최근 기록 최대 프레임 간격</span></div>','<div class="metric"><b>10</b><span>운영자 관점에서 추가한 과제</span></div><div class="metric"><b>4유형</b><span>메모리 저장소로 조건 재현</span></div>');
html=html.replace('이번에는 코드·기존 자료만 확인했으며,','추가 저장 항목은 실제 클래스와 가상의 메모리 저장소로 확인했습니다. 실제 사용자 저장 데이터는 건드리지 않았으며,');
html=html.replace(/<main><p class="recommend">[\s\S]*?<\/p>/,'<main><p class="recommend"><b>제 게임이라면:</b> MF-17·18 저장 성공/원본 보존 → MF-20 보상 정산 → MF-21 메인 진행 연결을 먼저 닫습니다. MF-01·02 성능 개선은 병행하되, 첫 15분의 완성 경험(MF-26)을 대표 출시 기준으로 둡니다.</p>');
html=html.replace('<button id="expand">','<label class="small"><input type="checkbox" id="new-only"> 이번 추가 10개만 보기</label><button id="expand">');
html=html.replace('<p class="legend">','<p class="legend"><b>조건부 경로 재현</b>은 실제 클래스를 메모리 저장소로 실행해 확인한 결과이며 사용자 피해 발생 기록과 다릅니다. <b>완성도 보완</b>은 제 게임이라면 추진할 설계 판단입니다. ');
html=html.replace('</style>','.status.reproduced{color:#833e2d;background:#f9e8e0}.status.risk{color:#876a24;background:#fbf2d9}.status.design{color:#496447;background:#eaf0e4}</style>');
html=html.replace('게임 수정·재배포·새 실기기 검사·브라우저 자동조작은 하지 않았습니다.','이후 저장·보상·실행 복구·배포 계약을 수정하고 관련 Node 검사 63개와 0.2 빌드를 통과했습니다. 새 실기기 검사·브라우저 자동조작은 하지 않았습니다.');
html=html.replace('<main><p class="recommend">','<main><div class="note"><b>이번 반영:</b> 저장 상태 표시 · 손상 원본 자동 덮어쓰기 차단 · 오래된 창의 저장 충돌 감지 · 10만 이후 골드 정산 · 의뢰 미구현 사유 표시 · 실행/그래픽 복구 · 소스와 배포 파일 일치 검사. <b>남은 부분:</b> 전체 세이브 복원, 완전 동시 탭 잠금, 실제 구울/홉고블린/반려동물 연결, 모바일 성능 후속입니다. 최신 준비 빌드 <code>moonforestV2-grKA-yi9.js</code>. 구현·자동검사 완료는 사용자 검수 완료와 다릅니다.</div><p class="recommend">');
html=html.replace('기준: 로컬 HEAD','검토 기준 커밋');
html=html.replace('이번 보고서 작성 중 실제 웹의 최신 파일·실행 결과를 새로 확인한 것은 아닙니다.','이전 보고서의 배포 기준입니다. 이번 수정의 준비 산출물은 <code>moonforestV2-grKA-yi9.js</code>이며, 웹 반영 여부와 실기기 검수는 별도 기록합니다.');
html=html.replace('게임 수정 없음</footer>','저장·보상·복구 개선 적용 · 실기기 검수 전</footer>');
html=html.replace('</style>','.status.implemented{color:#285640;background:#e3f2df}</style>');
html=html.replaceAll('moonforestV2-grKA-yi9.js',currentBundle);
html=html.replace('<main>','<main><div class="note"><b>성능 후속 반영:</b> 동일 정지 시야의 풍경 재검사, 모델 경계 중복 검증/행렬 조회, 길찾기의 반복 버퍼 생성·초기화, 맵 셰이더의 공유 예산 우회를 줄였습니다. 핵심 통합 검사29개·길찾기 호환 검사24개를 통과했습니다. 이들은 서로 겹칠 수 있는 검사 묶음이며 FPS 향상률이 아닙니다. <b>200ms급 긴 단일 GPU/드라이버 호출과 실제 모바일 성능은 아직 미확정입니다.</b> MF-05·07의 적용/남은 부분을 확인하세요.</div>');
writeFileSync(out,html);
console.log(JSON.stringify({file:relative(root,out),bytes:Buffer.byteLength(html),items:issues.length,first:issues.filter(x=>x.priority===1).length,evidenceFiles:sourceMeta.length,head:head.slice(0,7)}));
