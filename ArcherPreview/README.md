# Moonforest Character Preview

## 2026-10-31 모바일 조작·동굴·보스 업데이트

- 전사 v3/v4/v5의 **소환** 버튼에서 몬스터 종류·수량을 선택합니다. 기존 소환 기능과 전체화면은 유지하며 모달은 전체화면 루트 안에 둡니다. 터치 화면에서는 키보드 안내·중복 설명을 숨기고 전투 상태 문구를 설정 안으로 옮깁니다. 성능 진단은 기본 요약과 **자세히**를 구분합니다.
- **설정 → 보스 전투**에서 곰·성녀·마녀별로 최대 12개 패턴을 순서대로 추가·이동·삭제합니다. 같은 패턴을 중복해서 쌓을 수 있으며 마지막 이후 처음부터 반복합니다. 순서 사용을 끄면 기존 자동 패턴으로 돌아갑니다. 설정은 이 브라우저에 저장합니다. 배속은 기존 기본 속도 기준 0.5–2배이며, 진행 중 공격은 그대로 완료하고 다음 공격부터 적용합니다. 애니메이션·예고·실제 피해가 같은 시계를 사용합니다. 마녀의 시전 기본 1.6배와 시전 사이 이동·돌진은 유지합니다.
- iOS Web Audio의 `suspended`뿐 아니라 `interrupted`도 복구합니다. 터치/클릭의 직접 입력 안에서 재개·무음 프라이밍을 수행하며, 설정/소환 모달을 닫거나 맵 로딩을 마칠 때 재생 정지 상태를 해제합니다. 지원 환경에서는 playback AudioSession을 사용합니다. 다운로드와 오디오 재개는 서로 기다리지 않습니다. 자동검사는 복구 흐름을 검증하며 실제 iPhone의 무음 스위치·출력 장치·백그라운드 복귀 음성 확인을 대신하지 않습니다.
- 타락한 성녀의 **모든 속성 및 모프 데이터가 바이트 단위로 동일한 정점만** 공유합니다. 삼각형 103,930개, 표면·UV·노멀·스킨·클립을 보존하면서 정점 207,979→158,730개, 정점 버퍼 약 2.44 MiB 감소, 모델 묶음 11,851,752→10,192,872 bytes로 줄였습니다. 이 검증 당시 r8 비탄의 마녀는 143,132삼각형/94,210정점이었으며 같은 방식으로 공유할 중복이 없어 메시 감량을 적용하지 않았습니다. 현재 r9 인계 차이는 아래에 기록합니다. 얼굴·손가락·보정 모프·실루엣을 보존합니다. 물리 기기의 FPS 향상 수치로 해석하지 마세요.
- 플레이어 8K, 배경 최대 4K, 기존 LOD/카툰/외곽선 정책을 유지합니다. 이번 성녀 최적화는 JSON manifest와 모델/버퍼 2개만 새 해시를 사용하며 기존 17개 의존 리소스를 재사용합니다. 코드 변경 때문에 텍스처·배경을 다시 받게 하지 않습니다. 배포는 아래의 JSON 의존성·묶음·변경 파일 검증 절차를 계속 따릅니다.
- 마법 명칭·12개 개별 원화는 검수용 외부 자료입니다. 원화를 게임 시작 다운로드에 포함하지 않으며 기존 바닥 예고와 피해 도형은 유지합니다.

동굴은 이동 영역 사이를 실제 암반으로 막고 가까운 카메라 차폐만 좁게 완화합니다. 플레이어 시야를 **미탐험 검정 / 탐험했지만 현재 안 보이는 어두운 불투명 영역 / 현재 시야**로 나눕니다. 벽 너머 상세 지형·배경·보스·마법·외곽선·체력/피해/전리품 표시는 같은 시야 판정을 따릅니다. 보스 AI와 충돌은 화면 숨김과 분리합니다. 탐험 기억은 맵 왕복에 유지하며, 시야 마스크는 작은 고정 크기 텍스처를 공유하고 지형 덮개는 기존 지형 버퍼를 재사용합니다. 성능·자원 수·모달/소리·공격 시계는 CPU/DOM/NullEngine 회귀 검사로 검증하고 브라우저 자동조작은 하지 않습니다.

동굴 배치/지형 또는 보스 포즈 변경 시 충돌·마녀 전신 clearance와 시야 차폐 데이터를 함께 다시 굽고, 실제 모델 동선/회피/근접 판정 검사를 통과해야 합니다. 화면 밖 환경을 LOD/그림자/가림 처리에서 다시 켜지 않도록 FoW gate 검사도 유지합니다. 마을·숲에는 동굴 시야 처리를 적용하지 않습니다.

Mobile browser review of Azure Elf (Archer) and Violet Vanguard (Warrior). Use the character selector on the same page; only the selected model is loaded.

- Play: https://ranke0802.github.io/moonforest/ArcherPreviewSite/
- Warrior direct selection: append `?character=warrior`. The default remains Archer.
- Warrior equipment appearance: choose sword and shield independently under 장비 외형. Original, violet/silver and teal/bronze can be combined in all nine ways, including during movement or attacks. Selection is immediate and remembered per browser. The GPU palette preserves the original UV texture detail; no new GLB is loaded and no geometry, animation or attachment is changed. Archer has no equipment selector. These are material palette variants based on the approved design references, not swappable equipment geometry.
- Warrior: Run_03 with a controlled sword/shield carry is the default movement. WASD/joystick runs; J/Attack plays the approved native Thrust_Slash. Attack finishes before movement resumes. Holding Attack/J repeats the attack. Sword and shield stay attached in both clips. Only movement and attack controls are shown; target-hit detection is not included.
- Left lower touch area: dynamic joystick.
- Archer: Run toggle, Attack, Hit, Death / Revive buttons.
- One finger outside the joystick: orbit (or pan in camera Move mode). Two camera fingers: pinch zoom only; the joystick finger stays separate.
- Archer's three training dummies: attack automatically locks the nearest target within 14 m for that shot. A ring indicates the target, and arrow impact updates its hit count. Warrior follows the last movement heading without automatic aiming.
- Hold Attack or J for continuous fire; release to finish the current shot without starting another. Hit and Death cancel the held attack.
- Attack speed slider: 0.5–2x, applied immediately without restarting a shot. The 1x button resets it; the browser remembers the setting. Arrow release and repeat intervals share the animation clock. At 1x the cycle is about 2.16 seconds, at 2x about 1.08 seconds.
- Desktop: WASD, Shift, J attack, H hit, K death, R revive (Archer). Left or right mouse drag rotates, middle drag pans, wheel zooms. The mode switch controls touch orbit/pan.
- Quality: High (default, up to DPR3), Balanced (up to DPR2), Battery (DPR1). The choice is remembered on this browser.
- Fullscreen button requests landscape lock when supported. On browsers without orientation lock, rotate the phone manually. Unsupported fullscreen displays an explanation.

Archer has seven embedded clips: Idle, Walk, Run, Attack_Bow_Standing, Attack_Bow_Walking, Hit_Reaction, Death. The current Walk wrist posture and Death hair/prop issues are preserved for review; this is not a final animation approval.

Attack playback speed affects the authored full-body moving attack, including its legs. World movement speed stays under the joystick's control, so non-default attack speeds can cause foot sliding until the upper/lower-body animation is separated. Walk, Run, Hit and Death playback speeds are unchanged.

## Development

Requires Node >=22.12. Run `npm ci`, `npm test`, `npm run build` in this folder. Copy the built `dist/` contents into `../ArcherPreviewSite/`. GitHub Pages publishes the `archer` branch root; the root index redirects into the published build. `.nojekyll` disables Jekyll. Do not commit node_modules.

**The preceding generic build is for the legacy preview. Production warrior v3/v4/v5 must use the reviewed village pipeline below; do not overwrite it with `dist/`.**

The Archer GLB is about 48 MB; Warrior is about 53 MB. All exported skin influences are retained. First load depends on connection and mobile GPU. No account is needed to play. Source assets remain under public/assets. See public/NOTICE.txt for source credits and terms.

Warrior uses Violet_Vanguard_Controlled_Run.blend, retaining Violet_Vanguard_Run_Attack.blend as the pre-adjustment source. Run_03 comes from Meshy_AI_Violet_Vanguard_biped (1).zip: 25 frames at 30 FPS, sampled as 49 frames at 60 FPS with its original legs, torso, head and 0.8-second duration. Six arm/forearm/hand rotations are adjusted to keep the sword pointed forward and the shield stable; the rigid mounts are preserved. Thrust_Slash remains 181 frames at 60 FPS (3 seconds). Ready holds the approved attack's first pose. Run speed is 4.4371 m/s, estimated from planted toe travel; analog input scales both speed and gait playback. The approved grip is baked into export geometry. Each clip includes sword transforms; shield and straps retain their attachments. Painted unlit materials match the Archer viewer convention. Web skinning uses linear blending, not Blender's dual-quaternion option. Blender roundtrip and Babylon playback are checked; Unity/Godot playback and physical-phone certification are not implied.

## Warrior v2

Select 전사 v2 or use `?character=warrior-v2`. The existing warrior remains available. The supplied Idle_02 replaces the rejected custom idle. Accepted Run_03 and Thrust_Slash body motion is preserved; Right_Hand_Sword_Slash, Sword_Judgment and Shield_Push_Left are added from the supplied merged FBX. There is no dedicated hit/death clip in that archive.

J/Attack randomly chooses one of three sword attacks, excluding immediate repeats. Holding J continues choosing at each completed attack; the selector can pin one attack for review. F plays Shield_Push_Left separately. New sword attachments are rigid, hand-parented, without independent rotational lag. Shield mounting is fixed in forearm space within each action. The user explicitly chose equipment-angle adjustments without changing the body motion; source arm postures therefore use different fixed mounting offsets. The hand grip and forearm band retain contact, with fitted leather links to the rigid board. Sword_Judgment's net root translation is removed so recovery returns to the gameplay anchor. No melee hit detection is claimed.

## Resource reuse

The build losslessly splits each GLB into SHA-256-addressed textures, mesh buffers, skin data and animation buffers. All three characters share one persistent Cache Storage store. Cached files are served without downloading again; changed files receive new URLs, while unchanged files keep their existing URLs. The small current manifest is checked on load. A previously cached pre-upgrade warrior/archer GLB can seed the new cache after its checksum matches, without downloading the old GLB.

A cold browser still downloads the selected character once. Storage eviction, clearing site data, private mode or denied storage can require a later download. Cache tests cover concurrent duplicate requests, warm reloads, changed-animation-only files, and failed requests.

## 웹 전사 v3/v4/v5 리소스 배포 규칙

통합 최적화 담당자가 공용 다운로드·캐시·빌드·배포를 관리합니다. 에셋/맵 담당자는 변경 파일과 검증 결과를 전달하고, 공용 런타임 및 `ArcherPreviewSite`를 동시에 수정하거나 서로 다른 빌드를 push하지 않습니다. 작업 중인 다른 변경을 `git add -A`로 함께 배포하지 않습니다.

### 화면 확대 배율 확인·제한

설정 → 성능 진단을 켜면 현재 화면 확대 배율과 최소·최대 제한 상태를 표시합니다. 배율은 카메라 거리의 역수에 비례하며, 마을·숲·동굴은 거리 17을 1×로 함께 사용합니다(브라우저 확대, 화면 종횡비, 렌더 해상도 배율과 별개). 카메라 회전·맵 이동·기기 방향 전환으로 기준값을 바꾸지 않습니다. 복사한 진단 JSON의 `cameraZoom`에는 현재 배율·거리·기준 거리와 제한 설정을 포함합니다.

설정 → 화면 · 카메라에서 최소/최대 배율을 입력하고 **범위 적용**을 누릅니다. 각 체크박스로 최소/최대 제한을 독립적으로 해제할 수 있으며, 둘 다 기본 활성입니다. 최초 기본값은 기존 거리 범위 그대로입니다(월드: 모바일 0.8–56, 데스크톱 0.8–82). 선택한 값은 `moonforest-camera-zoom-world-v1`에 저장하고 다른 맵에서도 유지합니다. **기본값**은 원래 범위와 두 제한을 복원합니다. 최대 확대 제한을 해제해도 카메라 근평면을 보호하는 작은 안전거리는 유지합니다. 핀치·마우스 휠·확대/축소 버튼에 같은 제한을 적용합니다.

### S23 엘레나 소환 전후 성능 비교

설정에서 **FPS · 소환 비교 · 화면 배율 · 메모리 표시**를 켜고 같은 카메라 거리/방향에서 3초 이상 플레이한 뒤 보스 종류를 골라 소환합니다. 기존 진단창의 **소환 전후 비교**가 자동으로 펼쳐지며 소환 전 최근 3초 → 등장 후 5초의 평균 프레임 시간·드로콜·JS 메모리와 증감을 표시합니다. p95 프레임 시간, 준비 중 최대 지연, 리소스/모델/화면 준비 시간도 남깁니다. 비교를 접으면 기존 배율·로딩·메모리 정보가 다시 보입니다. 진단창은 고정 위치이며 전체화면/공격/회피/방패/물약 UI를 이동하지 않습니다.

첫 준비와 재소환을 구분합니다. 원래 거처 보스가 이미 존재하는 상태에서 재소환했다면 ‘보스 없는 맵’ 비교가 아니며, JSON의 `contextBefore`/`contextReady`/`contextAfter`로 시점·위치·보스 상태를 확인합니다. 같은 시점에서 가만히 있는 경우와 회전/이동/전투 중인 경우를 각각 기록해야 비교가 쉽습니다. 준비 중 긴 프레임은 등장 뒤 안정 구간과 분리합니다. 일시정지 시간은 프레임 표본에서 제외하고, 맵 이동은 진행 중 비교를 중단합니다. 이전 표본 부족/목표 FPS 변화도 표시합니다.

**기록 복사** JSON v3의 `bossComparison`에는 전/준비/후의 mean/p95/max와 표본 수, 단계 시간, 메모리, 카메라/장소/활성 보스, 목표 FPS가 포함됩니다. 이전 비교는 최대 3개만 `bossComparisonHistory`에 남깁니다. `recentDelays`에는 당시 드로콜·화면 CPU·애니메이션 CPU·보스 이동 계산·피격 판정 시간과 준비 단계를 넣습니다. CPU 항목들은 포함 관계가 있으므로 서로 더하지 않습니다. 드로콜은 그림자와 외곽선 패스도 포함하며, 리소스 단계에는 캐시 조회·네트워크·모델 해석이 함께 포함됩니다.

`performance.memory`는 Chrome의 대략적인 JS 힙이며 기기 전체 RAM/GPU 메모리가 아닙니다. 미지원 값은 `—`로 표시합니다. 가비지 수집 때문에 메모리 증감만으로 누수를 단정하지 않습니다. GPU 동기화/화면 읽기/원격 전송 없이 측정하고, 진단을 끄면 장면 계측 observer를 제거합니다. 고정 길이 프레임 버퍼, 초당 1회 메모리 조회, 초당 2회 HUD 갱신으로 측정 부하를 제한합니다. 테스트는 NullEngine 계수·준비 단계·중단/실패·반복 켜기/끄기·JSON·HUD를 검증하며 실제 S23 FPS를 대체하지 않습니다.

### JSON 버전 확인

`assets/resource-index.json`은 매 빌드에 현재 manifest와 glTF 의존성을 따라 자동 생성합니다. 직접 버전 숫자나 파일 이름을 고치지 않습니다.

| 필드 | 의미 |
| --- | --- |
| `version` | JSON 형식 버전(현재 1) |
| `revision` | 현재 파일·묶음 목록 전체의 SHA-256 버전 |
| `files` | `SHA-256.확장자 → 파일 크기` 목록. 파일명 해시가 그 파일의 버전 |
| `bundles` | 압축 묶음 URL·전송 크기·해제 크기·구성 파일 목록 |

파일이 바뀌면 해당 파일의 해시와 이를 참조하는 작은 manifest만 바뀝니다. UI 코드만 바꾸면 리소스 버전과 URL은 동일합니다. 위치/색상 등 데이터만 수정할 경우 원본 전체를 다시 내보내지 말고 해당 JSON 또는 필요한 부분만 수정합니다. 모델 재출력 시에도 기존 분할 도구가 이미지·메시·애니메이션을 내용 해시로 구분해 동일한 부분을 재사용합니다. 이는 파일 단위 차등 갱신이며, 변경된 단일 파일 내부에 binary patch를 적용하는 방식은 아닙니다.

### 다운로드와 캐시

1. 시작 화면/현재 LOD에 필요한 파일과 로컬 캐시를 비교합니다.
2. 묶음의 모든 파일이 필요하고 모두 누락된 경우에만 `.mfp.gz`를 받습니다. 원본 바이트를 순서대로 연결해 gzip으로 압축한 포맷이며, 경계는 JSON의 파일별 크기로 읽습니다.
3. `DecompressionStream`으로 해제하고 파일별 SHA-256을 확인한 뒤 기존 `moonforest-resources-v1` 캐시에 저장합니다. 묶음 자체는 `no-store`로 받아 보관하지 않습니다.
4. 일부만 바뀌거나 캐시에서 빠졌다면 그 개별 파일만 받습니다. 아직 필요하지 않은 먼 지역/LOD를 묶음 때문에 받지 않습니다.
5. 재접속/맵 왕복은 같은 해시를 재사용합니다. 다운로드 MB는 이번에 필요한 압축 묶음+개별 파일 크기이며 캐시된 용량은 제외합니다.

묶음 해제 크기는 최대 4 MiB, 구성 파일은 최대 1 MiB입니다. 큰 8K 플레이어 텍스처는 기존 스트리밍 다운로드로 받으며 전체 게임 ZIP을 메모리에 펼치지 않습니다. 압축 해제 API가 없으면 개별 파일 방식으로 시작합니다. 네트워크/체크섬 오류 후 같은 묶음을 자동 반복 요청하지 않습니다. 저장소가 거부되면 실제 모델 로더의 일반 HTTP 다운로드를 사용합니다.

**플레이어 8K, 배경 최대 4K, 기존 LOD·KTX2·Meshopt·텍스처 업로드 간격은 유지**합니다. 신규 원화/모델 생성은 이 빌드에 포함되지 않습니다.

### 구버전 정리

서비스워커는 열린 게임 탭마다 JSON 파일 목록을 등록받아 그 합집합에 없는 구버전만 삭제합니다. `moonforest-resource-graphs-v1`에 등록을 보관해 워커 재시작 후에도 다른 탭의 구버전을 보호합니다. 구형 탭이 목록을 등록하지 않았다면 정리를 보류합니다. 그 탭을 닫은 뒤 새로 접속할 때 다시 정리합니다. 같은 해시의 파일은 하나만 저장해 캐릭터와 맵 사이에 공유합니다. 브라우저의 저장 공간 회수/사이트 데이터 삭제는 재다운로드를 일으킬 수 있습니다.

서버에는 부분 갱신·호환성을 위해 개별 파일과 현재 압축 묶음을 함께 게시하지만 브라우저에는 해제된 개별 파일만 남습니다. 작업 폴더의 이전 묶음/원본은 `deployment-files.json`에 없으면 게시되지 않습니다.

### 앞으로의 배포

음향을 수정한 경우에는 [현재 웹 음향 제작·검증 안내](docs/world-audio.md)의 패킹/HTML 목록 생성과 음향 검증을 먼저 수행합니다. 기존 파일 해시를 유지하고 `audio.json`에서 달라진 항목만 갱신하며 출처 표기를 함께 배포합니다.

이 폴더에서 실행합니다(Node >=22.12).

```sh
npm ci
npm test
npm run build:village
npm run sync:village
node scripts/stage-pages.mjs reports/pages-validation
```

- `pretest`와 `predev`는 기존 리소스에서 묶음/JSON만 준비합니다. 생성물 `public/assets/bundles`와 `resource-index.json`은 Git에서 제외되며 재현 가능합니다.
- `build:village`는 모델 생성/재변환을 실행하지 않습니다. 현재 리소스 해시, 4K/LOD 조건, 압축 해제 결과, 전체 1 GB 한도 등을 검사하고 `dist-village`를 만듭니다.
- `sync:village`는 빌드 전체 검증 후 달라진 배포 파일만 복사합니다. 변경 경로는 `reports/publish-village-paths.txt`, 요약은 `reports/publish-village-build.json`에 남습니다.
- GitHub Actions의 `stage-pages.mjs`도 JSON 버전, 묶음 내부 체크섬, 게시 목록을 검사합니다. 구형 배포 형식이나 불일치가 있으면 배포를 중단합니다.
- 소스와 위 배포 경로만 검토·커밋한 후 `git push origin HEAD:archer` 합니다. 모델 변환용 `prepare:village`는 별도 승인된 에셋 변경 때만 실행합니다.

### 점검 기준

최적화 작업은 [기능 보존 검증 프롬프트](docs/optimization-verification-prompt.txt)를 먼저 적용합니다. 기능·화질을 낮추는 변경은 제외하고, 기준 커밋과 리소스 JSON revision을 기록한 뒤 재현 가능한 비용만 수정합니다. 브라우저 자동조작 없이 코드·Node/NullEngine으로 확인한 항목과 실제 S23에서 확인해야 하는 항목을 구분합니다.

```sh
node scripts/audit-runtime-optimization.mjs reports/optimization-verification/before.json
# 검증된 원인을 수정한 뒤, 다른 부하 테스트와 동시에 실행하지 않고 비교
node scripts/audit-runtime-optimization.mjs reports/optimization-verification/after.json
node --test tests/*.test.js > reports/optimization-verification/full-tests.log 2>&1
node scripts/summarize-runtime-optimization.mjs reports/optimization-verification
```

위 측정은 지형/맵 구성 CPU 시간과 재질 참조 수명만 확인합니다. 다운로드·모델 준비·GPU 업로드 전체 시간이나 S23 FPS/발열 측정이 아닙니다. 반복 왕복의 scene 자원 수, 지형 SHA-256, 폐기 재질 재검사 횟수와 캐시 크기도 기록합니다. 보고서의 시간은 같은 PC에서 첫 방문을 제외한 8회 표본이며 절대 성능 보장이 아닙니다.

2026-10-29 검증에서는 지형 높이 배열을 엔진별 최대 3개·512 KiB까지 재사용하도록 했습니다(현재 3개 합계 356,364바이트). 방문마다 독립 복사본을 사용하며 지형·보행 결과는 원본과 같습니다. 동굴 색조 관리자는 실제 재질 폐기 시 참조를 해제하며, AssetContainer에 잠시 옮긴 살아 있는 재질은 유지합니다. 성능 진단을 복사한 JSON의 `mapTerrainCache`와 `caveMaterials`로 한도·대기/활성 참조 수를 확인할 수 있습니다. 플레이어 8K·배경 최대 4K·LOD·그림자·조작 정책은 그대로입니다.

[이번 검증 결과](reports/optimization-verification/report.txt)와 [기계 판독용 검증 JSON](reports/optimization-verification/verification.json)에 측정 범위·수치·미검증 항목을 남겼습니다. `before.json`/`after.json`은 해당 커밋 작업의 원시 표본이므로 다음 검증은 별도 폴더에 보관합니다.

동굴 파일을 인계받을 때는 승인된 목록과 SHA-256을 비교해 선별 적용한 뒤 `build:village`로 현재 JSON·묶음·크기 목록을 재생성합니다. `node scripts/verify-cave-integration.mjs`는 실제 현재 목록과 파일 그래프를 대조하고 동굴 이동·셰이더·리소스·왕복 검사를 수행합니다. 전체 통합 테스트도 배포 전에 통과해야 합니다. 동굴 바닥처럼 일부만 바뀌면 새 해시만 추가하고, 기존 다른 맵·플레이어·LOD의 해시는 유지합니다. 구버전 파일은 전체 의존성에서 제외된 것을 확인한 뒤 게시 목록에서 제외하며 열린 구버전 탭의 캐시는 기존 보호 규칙을 따릅니다.

2026-10-30 전사 v5 보강은 이미 승인·납품된 수로 바위(s03)와 두꺼운 절벽 기단(s01)만 사용합니다. 기존 20종 + 보강 2종 + 정확한 재사용 6종이며 이번 통합에서 모델 생성은 하지 않습니다. `pack-witch-cave.mjs`는 `CAVE_SOURCE`와 `CAVE_SUPPLEMENT_SOURCE`의 제작 장부를 확인하고, 기존과 같은 근거리 메시/1K 시작 텍스처 + 최대 4K 지연 로딩, 3단계 LOD, KTX2/Meshopt를 구성합니다. 플레이어 8K와 다른 맵 리소스는 바꾸지 않습니다.

동굴 배치·지형을 변경하면 `node scripts/bake-cave-collision.mjs`로 실제 근거리 메시의 충돌을 다시 굽고 `node scripts/export-cave-layout.mjs --update-manifest`로 배치 수를 맞춥니다. 수로의 물줄기는 모든 LOD에서 같은 홈을 따라가며 물높이는 연결된 수면에 맞춥니다. 상부 수로 일부는 높게 유지한 보행로 아래를 지나고, 지형 수정은 비보행 수로 바닥에 한정합니다. 물 표면 전체는 300삼각형/불투명 재질 2개이며 별도 텍스처·반사·굴절·파티클은 추가하지 않습니다. `tests/witch-cave-supplements.test.js`는 실제 3단계 메시와 물의 겹침, 수면 연결, 기단 잠김, 수로/보행로 분리를 검사합니다. 아래 기존 배포 절차와 전체 회귀 테스트를 함께 통과한 후에만 게시합니다.

### 엘레나 2단계 보스 · 전사 v5

동굴 거처 `(29, -25.5)`의 **타락한 성녀 엘레나**(체력 1,200)를 쓰러뜨리면 **비탄의 마녀 엘레나**(체력 1,800)로 전환합니다. 플레이어 캐릭터·체력·물약·장비는 바꾸지 않습니다. 성녀의 쓰러지는 동작을 유지하며 다음 모델 준비가 완료된 뒤 한 명으로 교체합니다. 1단계에서 처치 보상은 발생하지 않고, 최종 처치 이벤트는 2단계에서 한 번만 발생합니다. 이탈 중 완료된 다운로드가 다른 맵에 보스를 생성하지 못하도록 세션 번호를 검사합니다. 각 단계의 모델은 최대 한 벌만 보관하며 왕복 시 현재 단계·체력·모핑 시계를 유지합니다. 재시작은 1단계부터 초기화합니다.

성녀는 원본 FBX의 18모션 중 대기·이동·다운·기상과 **모든 공격 7개**를 포함한 12동작을 사용합니다. `mage_soell_cast_2~7` 여섯 동작과 `Axe_Spin_Attack` 모두 마법입니다. 103,930삼각형과 원본 리깅을 유지합니다. 비탄의 마녀는 완료 인계된 `tripo-1-move-v2-1/model.glb`, 리비전 `r9-attack-shape-repair`, SHA-256 `9673c3aa680f521c8d861001458e41e98dabc6edb046cf726c13540acc31f061`의 복사본입니다. 143,228삼각형, 255변형 뼈, 2스킨, 본체 11모프·입 내부 1모프와 8클립을 무손실 Meshopt로 보존합니다. 자동 리깅·재가중치·메시 감량은 하지 않습니다.

`mourning-elena-animation.js`는 검수 코드의 보행/시전 가중치, 시전 후 보행 시계 초기화, 독립 머리카락·호흡·후광·중력 천을 이식합니다. `Cast_Palm_Cleanup`과 `Cast_Elbow_Form`은 시전 곡선으로, 기존 세 모프는 호흡/보행 시계로 구동합니다. r9 머리카락 시전 바람과 사망 보정 모프는 각각 독립 곡선으로 처리합니다. 기도 손의 독립 동작과 기존 호흡 모프 분리를 유지합니다. 동일한 상수 채널의 반복 쓰기를 생략하며 전투와 검수는 매 프레임, 비전투 원거리는 30/15 Hz로 샘플링합니다. 본체 11개·입 내부 1개의 모프 슬롯을 고정하여 시전마다 셰이더가 다시 만들어지는 것을 막고, 외곽선도 본체와 동일한 스킨·모프를 공유합니다.

두 단계 모두 바닥 범위/경로로 예고합니다. 직선·부채꼴·고리·십자·다중 원형의 5패턴이며, 비탄의 마녀는 원본 3초 시전 모션을 **1.6배**로 재생합니다(동작 지속 1.875초). 5.7m 확대 후 부채꼴·십자 범위를 피할 시간을 확보하기 위해 동작 앞에 **0.65초 예고 준비**를 둡니다. 동작과 상완·손 보정키는 원본 클립 시계로 유지하며, 원본 1.65초 방출 자세에서 실제 피해가 한 번 발생합니다(전체 예고 약 **1.681초**, 준비 포함 시전 2.525초). 조준은 준비 시작부터 고정하고 장판 진행률은 준비 시간을 포함합니다. 예고와 판정은 동일한 도형을 공유하고 회피·방패·차폐·중단·맵 이탈을 처리합니다. `elena-ground-magic.js`는 채움/테두리 메시 두 개를 재사용합니다. 정식 마법 이펙트나 새 텍스처는 추가하지 않았습니다.

성녀는 시전 사이에 옆으로 이동하거나 거리를 벌립니다. 비탄의 마녀는 교전 중 대기 공백 없이 일반 이동(1.05 m/s), 빠른 횡이동(3.6 m/s), 돌진(5.4 m/s)을 섞고 그 사이에 5종 마법을 사용합니다. 시전 중에는 이동하지 않습니다. 돌진은 0.9초 동안 바닥 경로를 예고하고 조준 당시의 플레이어 위치를 향해 이동하며 **기본 42 피해**를 한 번 줍니다(방어·후방 피격 보정은 공통 규칙). 전체 예고 길을 즉시 공격하지 않고 실제 지나간 구간과 몸체 폭을 쓸어 검사합니다. 판정은 표시된 경로 안으로 제한하며 회피·방패·무적 때 접촉을 소비해 같은 돌진이 나중에 다시 피해를 주지 않습니다. 벽·바닥 단차·거처 범위를 검사하고 유효한 돌진 경로가 없으면 일반 이동으로 바꿉니다. 강한 경직·패링은 진행 중 돌진을 취소하고, 수동 조작 검수에서는 자동 이동하지 않습니다.

곰·성녀·마녀는 일반 검 공격으로 체력과 흰색 피격 효과만 갱신하며 이동/시전을 멈추거나 재시작하지 않습니다. 방패의 명시적 기절·강공격·패링·사망 규칙은 유지합니다. 비탄의 마녀 피격 영역은 r7부터 보존한 스킨에 맞춘 몸통·모든 사지·손발·기도 팔·큰 손가락의 49개 캡슐입니다. 뼈 로컬 보정점을 따라가며 팔 사이 빈 공간은 유지합니다. 최초 만든 캡슐/끝점을 재사용하고, 검의 현재/이전 위치 및 횡베기 폭을 포함한 보수적 AABB 검사로 먼 사지는 정밀 검사 전에 제외합니다. `elena-hurt-volumes.test.js`와 `melee-broadphase.test.js`에서 실제 스킨·빈 공간·중복 방지와 이전 정밀 알고리즘의 동일 결과를 검사합니다.

초회 소환은 성녀도 단일 resident 컨테이너를 직접 사용해 모델 복제를 없앱니다. 마녀가 이미 로딩한 변형 텍스처를 다시 생성하지 않으며, WebGL2에서는 가중치 0인 변형만 건너뜁니다. 각 메시의 모든 원본 타깃·노멀을 유지합니다. S23/iPhone 대상 WebGL2 텍스처 경로를 검증하며, CPU 속성 경로 검사는 실제 구형 WebGL1 기기 지원을 보증하지 않습니다. 모델을 보이기 전에 본체와 외곽선 셰이더를 프레임 사이에 순차 준비합니다. `benchmark-elena-models.mjs --baseline`/`--current`는 초회 작업과 지속 CPU/변형 작업량을 분리해 기록합니다. 이 검사는 실제 S23 GPU FPS·발열이나 모든 끊김 제거를 보증하지 않습니다.

불투명 상태의 엘레나 흰 피격 표시는 별도 overlay draw 대신 기존 본체 셰이더의 안개/색 보정 뒤에서 동일한 흰색 알파 합성으로 처리합니다. 이때 성녀 1개·마녀 3개 본체를 추가로 그리던 패스를 줄이고 외곽선의 흰 반응은 유지합니다. 사망 페이드·투명/알파테스트 재질은 기존 overlay 경로로 전환해 순서와 외형을 보존합니다. 다른 캐릭터/몬스터의 피격 효과는 변경하지 않습니다. `elena-hit-flash.test.js`에서 합성식·본체/외곽선 바인딩·추가 draw 없음·투명 fallback·셰이더 재사용을 검사합니다.

맵 이탈로 중단한 시전·돌진 예고는 취소합니다. 복귀 시 단계와 체력은 유지하되 공격은 새 예고부터 시작하므로 이전 시전 끝부분에서 갑자기 피해가 나오지 않습니다. 플레이어 사망·피격 중단도 예고와 판정을 함께 취소합니다. 보스 소환 영역의 종류 선택에서 곰·타락한 성녀·비탄의 마녀를 고릅니다. 엘레나는 동굴에서 1명만 소환하며 같은 단계별 인스턴스를 재사용합니다. 선택 소환은 플레이어 체력·물약·장비를 초기화하지 않습니다.

장판의 채움/테두리 GPU 버퍼는 동일한 연결 구조별로 재사용합니다. 인스턴스당 최대 7쌍(geometry 14개)의 LRU 상한을 두고 오래된 항목과 최종 폐기 시 버퍼를 해제합니다. 패턴 교체 시 전체 인덱스 범위도 갱신합니다. 정지 중 불필요한 경로 검색과 공격 판정이 없는 프레임의 시야 검사를 생략하되 실제 마법 발사·피격 때는 차폐 검사를 유지합니다. `tests/elena-combat-stress.test.js`, `elena-mourning-movement.test.js`는 실제 모델로 단계 전환·사망·재시작·맵 왕복·예고/판정 및 이동을 검사합니다. CPU 비교는 `node --expose-gc scripts/benchmark-elena-combat.mjs --baseline`과 `--current`를 다른 부하 검사 없이 순차 실행하며 S23 GPU 성능 측정과 구분합니다.

현재 배포는 r9 완료 인계의 기도 대기 6초, 명시적 경직 피격 1.3초, 보정된 팔·손 및 Hair_Cast_Wind 모프를 사용합니다. 시전 중 징표 속도 1→3→1은 원본 클립 진행 초를 입력으로 사용하며 위상을 리셋하지 않습니다. 일반 검 공격에는 원본 피격 클립의 상체 회전 차이를 0.38초 동안 더하는 작은 반응과 흰 피격 표시를 사용합니다. 시전 중에는 머리·목만 반응해 큰 팔의 주문 동작과 기도 손을 보존하며, 이동·시전·피해 시계는 멈추지 않습니다. 명시적 경직은 기존 전신 피격 클립을 사용하고 모션 완료 때문에 경직 시간을 연장하지 않습니다. 원래 r7 검수·Blender·FBX 9개는 체크섬으로 보존하며, 동일한 4K 텍스처는 이전 해시를 그대로 재사용합니다. 현재 의존성에서 빠진 구버전만 게시 목록에서 제외하고 열린 구버전 탭의 캐시를 보호합니다.

비탄의 마녀는 후광을 제외한 몸체 기준 **5.7m**입니다. 원본 몸체 2.7m 기준의 단일 비율 `5.7/2.7`을 런타임에 적용하며, manifest의 3.2m(후광 포함) 기준 원본 스케일을 덮어쓰지 않습니다. 반복 소환 때 절대 스케일을 대입해 중복 확대를 막습니다. 실제 스킨의 약 2.698m는 약 5.696m가 됩니다. 피격 캡슐 반경/끝점, 충돌 반경(1.9m), 접지 표시, 소환 안전 간격, 렌더 경계, HP바 높이, 검수 카메라 초점, 조준 보조 거리와 보폭을 맞춥니다. 플레이어 체격·검 길이·이동 속도는 그대로입니다. 마법 영역을 확대하되 기존 방의 14m 최대 사거리/9m 타겟 중심 제한을 유지하며 동일 도형으로 예고와 판정합니다. 지상 마법의 방패 방향은 확대된 손 높이가 아니라 보스 중심에서 플레이어 가슴 높이를 향하도록 보정합니다. 돌진은 폭 3.8m, 속도 5.4m/s, 이동 최대 6.3m, 0.9초 예고와 1회 피해를 유지합니다.

외형은 PBR 끔 / 카툰 / 외곽선 0.50 CSS px / 내부선 0.20 / 밝기 1.35 / 접촉 바닥 켬입니다. 로컬 검수의 브라우저 저장소는 자동으로 읽지 않았으며, 제공된 설정과 저장된 기준 코드를 적용합니다. 플레이어 8K, 배경 최대 4K와 기존 3단계 LOD는 유지합니다. 마녀 색상은 4K ETC1S q255/RDO 끔/전체 밉, 원본 대비 직접 디코드 PSNR 40.88dB입니다. 색상 텍스처 메모리 계산과 스킨/모프용 float 텍스처 비용은 구분해 기록합니다.

5.7m 마녀의 전신 이동 범위는 `MourningCaveNavigation`으로 따로 검사합니다. 제단·전방 수집팔 2개·목재 지지대·문양의 기존 배치 5개를 거처 가장자리로 옮겼으며, 높이별 실제 스킨 자세를 굽는 `mourning-cave-clearance-data.js`는 플레이어의 보행 범위나 피격 캡슐을 넓히지 않습니다. 소환·변신 요청 위치가 전신에 좁으면 가장 가까운 안전한 거처 위치를 사용합니다. 근접 밀어내기 간격은 마녀만 2.15m이며 실제 검/방패의 길이·활성 타이밍·49개 피격 부위는 그대로입니다.

마녀의 경로는 전신 안전 표의 보수적 여유 거리 안에서 연속적으로 검사합니다. 40cm 간격 표본 사이로 좁은 오목 모서리를 건너뛰던 경로를 거절하고, 실제 이동·귀환 검사와 맞춥니다. `MourningLocomotion`은 최근 6개 위치, 안쪽 여유, 플레이어를 관통하지 않는 경로를 비교해 행동당 최대 36개 후보 중 목적지를 고릅니다. 걷는 동안 약 0.28초마다 실제 진전을 확인하고, 막히면 그 행동에서 대체 이동을 한 번 시도한 뒤 새 예고를 갖춘 마법으로 이어집니다. 돌진은 0.2초 간격으로 예고 경로를 확인하고 출발 직전에도 검사합니다. 막힌 돌진은 기존 장판과 피해 경로를 해제하며 경고선을 다른 방향으로 휘지 않습니다. 경고 0.9초·속도·한 번의 피해·회피 정책은 유지됩니다. 전투 감지에는 진입 9m / 이탈 10.5m 간격을 두어 경계에서 교전과 귀환을 반복하지 않도록 합니다.

이동 AI를 변경하면 `node scripts/audit-elena-navigation.mjs --label after --check`로 실제 rig의 벽·제단측 시작, 정지/이동 플레이어, 30/60fps, 돌진 예고/이동 중 실제 장애물 추가, 완전히 막힌 공간과 장애물 없는 돌진 대조군을 검사합니다. 비교 기준은 `--baseline --label before`의 고정 `b3a981c` 소스입니다. 의도된 시전·예고 정지를 걷기 정체로 세지 않으며 경계 이탈, 반복 왕복, 실제 피해, 옛 경고 잔존, 조회 횟수와 자원 수를 함께 기록합니다. 이는 S23 GPU FPS 측정이 아닌 CPU 동작 검증입니다. 전체 자동검사 후 기존 JSON 해시·묶음 배포 절차를 유지합니다.

동굴 배치, 근거리 메시, 마녀 스케일/모션/모핑을 바꿀 때는 `node scripts/bake-cave-collision.mjs`, `node scripts/bake-mourning-cave-clearance.mjs --write`를 순서대로 실행하고 지문 검사 및 `node scripts/audit-elena-clearance.mjs --safe-only` 정밀 검사를 다시 통과해야 합니다. 이 검사는 실제 스킨과 환경 삼각형을 사용하며 런타임에서는 약 117 KiB 거리 표만 한 번 캐시합니다. `tests/elena-real-combat.test.js`는 실제 전사 rig/검/방패/구르기 경로로 접근·피격·회피를 재생합니다. 안전상 거절한 돌진, 탐지거리 이탈로 취소된 주문, 단순 자세 점 조준을 회피·명중 성공으로 세지 않습니다. 원거리 검 미스와 무방어 실제 돌진 피해도 함께 검사합니다. 반복 전투/왕복 자원 검사와 전체 회귀 검사를 통과한 뒤 기존 JSON 해시·묶음·Pages 절차로 게시합니다.

`public/assets/elena.json`과 `mourning-elena.json`을 기존 JSON 해시·묶음·캐시 체계로 배포합니다. 성녀는 동굴 시작 리소스, 광폭화 모델은 성녀와 교전할 때 준비합니다. 마을·숲의 시작 다운로드에는 포함하지 않습니다. 코드만 바뀌면 기존 모델·텍스처 해시는 유지됩니다. 배포는 전체 회귀 테스트 → `build:village` → `sync:village` → `stage-pages.mjs` → 기존 `archer` Pages 절차를 사용합니다. 원본/Blender/검수 렌더는 게시 목록에 넣지 않습니다.

검수 진입점은 `?character=warrior-v5&elenaReview=witch`(마녀 조작), `elenaReview=saint`(성녀 조작), `elenaReview=battle`(거처 앞에서 정상 2단계 전투)입니다. 조작 검수는 WASD/스틱 이동, 좌클릭/J/기존 공격 버튼 시전, 기존 카메라 회전을 사용합니다. 일반 URL에서는 원래 전사를 계속 조작합니다. 브라우저 자동조작 없이 실제 모델의 NullEngine 포즈·전투·왕복·셰이더와 오프라인 렌더를 검증하며, S23 실제 GPU FPS·발열·최종 화면 검수와 구분합니다.


자동테스트는 첫 묶음 다운로드, 캐시 재접속 0바이트, 한 파일 변경/부분 캐시, 맵 왕복, 손상·중단·저장공간 거부, 구버전 탭 보호 및 정리를 확인합니다. 실제 모델을 사용한 S23/iPhone 화면 크기 테스트도 유지합니다. 이는 실기기 통신 속도·발열 측정과 다릅니다.

설정의 성능 진단 결과를 복사하면 `resourceDownloads`에 JSON `revision`, `bundleRequests`, `fileRequests`, `extractedFiles`, `cacheHits`, `downloadBytes`가 포함됩니다. 캐시가 있는 재접속은 `downloadBytes: 0`이어야 합니다. 서비스워커 `RESOURCE_CACHE_STATS` 메시지는 `prunedFiles`, `cleanupDeferred`, `cleanupError`를 반환합니다. 브라우저 자동조작은 수행하지 않으며 실기기 검수는 사용자가 진행합니다.

2026-10-29 기본 시작 계획: 요청 241건 → 73건(묶음 33건). 전송 57,619,614 → 55,718,029바이트; 압축 플레이어 프로필은 78,114,058 → 76,212,473바이트. 현재 시작 위치/화면 조건의 계획 수치이며 실제 시간이나 모든 위치의 고정 용량은 아닙니다. 요청 사이 대기 시간이 주된 개선 대상이고 이미 압축된 큰 텍스처의 용량 감소는 작습니다.


### r9 사망 모션 및 위쪽 카메라 시야 · 2026-10-31

비탄의 마녀의 마지막 생존 자세를 저장해 0.18초 동안 `Chimera_Death_Lament_5p2s`로 전환합니다. 사망 5.2초와 끝 자세 0.65초는 공격 속도와 독립적입니다. 본체·외곽선은 불투명으로 유지하고 같은 프레임에 숨기며 보상은 한 번만 발생합니다. 다른 적의 5초 투명화와 성녀→마녀 변신 정책은 유지합니다. 사망 중 새 공격·경직·이동은 시작하지 않고 호흡 모프를 멈추며 후광은 현재 위상에서 2.8초에 걸쳐 멈춥니다. 입 내부는 비명 모프가 활성일 때만 그리며 별도 외곽선은 만들지 않습니다. 비명 음향은 추가하지 않았습니다.

r9 원본 11파일의 해시를 전후 확인하고 복사본만 Meshopt로 패킹합니다. 본체 137,412삼각형의 위치·UV·노멀·관절·가중치는 r8과 모든 삼각형 꼭짓점에서 바이트가 동일합니다. 내보내기 보정 노멀 때문에 정점 31개가 분리되고 입 내부 96삼각형이 추가됐습니다. 4K KTX2 색상 텍스처는 기존 해시를 재사용합니다. 파일 묶음은 12,858,547바이트이며, 추가 사망 모프 때문에 GPU 변형 텍스처 저장량 추정은 13.75→30.26 MiB로 증가합니다(최대 텍스처 폭 4096, 본체와 외곽선 공유). 0 가중치 타깃은 건너뛰며 생존 시 활성 최대 6개, 시전→사망 전환 순간 최대 8개입니다. 새 동작 추가를 메모리 절감으로 보고하지 않습니다.

`설정 → 화면 · 카메라 → 위쪽 시야 제한`은 기본 체크입니다. 전사는 기존 수평 아래 약 5.2°에서 수평 위 약 12.0°까지 기본 시야를 넓힙니다. 체크를 해제하면 약 88°까지 올려다볼 수 있으며 뒤집힘을 막기 위해 수직 바로 직전에서 멈춥니다. 아래쪽 한계(β=0.25), 턱 기준 일반 줌과 배율 설정은 유지합니다. 올려다볼 때만 포커스를 보정해 카메라가 턱 아래 0.35m보다 내려가지 않게 합니다. 설정을 저장하며 맵 왕복·일시정지에도 동일하게 적용합니다. 궁수의 기존 제한은 유지합니다. 브라우저 자동조작 없이 실제 카메라 행렬·화면 투영·입력·설정 저장·맵 왕복을 자동검증합니다. 물리 S23/iPhone의 최종 화면은 사용자 검수가 필요합니다.
