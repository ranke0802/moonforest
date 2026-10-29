# Moonforest Character Preview

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

**The preceding generic build is for the legacy preview. Production warrior v3/v4 must use the reviewed village pipeline below; do not overwrite it with `dist/`.**

The Archer GLB is about 48 MB; Warrior is about 53 MB. All exported skin influences are retained. First load depends on connection and mobile GPU. No account is needed to play. Source assets remain under public/assets. See public/NOTICE.txt for source credits and terms.

Warrior uses Violet_Vanguard_Controlled_Run.blend, retaining Violet_Vanguard_Run_Attack.blend as the pre-adjustment source. Run_03 comes from Meshy_AI_Violet_Vanguard_biped (1).zip: 25 frames at 30 FPS, sampled as 49 frames at 60 FPS with its original legs, torso, head and 0.8-second duration. Six arm/forearm/hand rotations are adjusted to keep the sword pointed forward and the shield stable; the rigid mounts are preserved. Thrust_Slash remains 181 frames at 60 FPS (3 seconds). Ready holds the approved attack's first pose. Run speed is 4.4371 m/s, estimated from planted toe travel; analog input scales both speed and gait playback. The approved grip is baked into export geometry. Each clip includes sword transforms; shield and straps retain their attachments. Painted unlit materials match the Archer viewer convention. Web skinning uses linear blending, not Blender's dual-quaternion option. Blender roundtrip and Babylon playback are checked; Unity/Godot playback and physical-phone certification are not implied.

## Warrior v2

Select 전사 v2 or use `?character=warrior-v2`. The existing warrior remains available. The supplied Idle_02 replaces the rejected custom idle. Accepted Run_03 and Thrust_Slash body motion is preserved; Right_Hand_Sword_Slash, Sword_Judgment and Shield_Push_Left are added from the supplied merged FBX. There is no dedicated hit/death clip in that archive.

J/Attack randomly chooses one of three sword attacks, excluding immediate repeats. Holding J continues choosing at each completed attack; the selector can pin one attack for review. F plays Shield_Push_Left separately. New sword attachments are rigid, hand-parented, without independent rotational lag. Shield mounting is fixed in forearm space within each action. The user explicitly chose equipment-angle adjustments without changing the body motion; source arm postures therefore use different fixed mounting offsets. The hand grip and forearm band retain contact, with fitted leather links to the rigid board. Sword_Judgment's net root translation is removed so recovery returns to the gameplay anchor. No melee hit detection is claimed.

## Resource reuse

The build losslessly splits each GLB into SHA-256-addressed textures, mesh buffers, skin data and animation buffers. All three characters share one persistent Cache Storage store. Cached files are served without downloading again; changed files receive new URLs, while unchanged files keep their existing URLs. The small current manifest is checked on load. A previously cached pre-upgrade warrior/archer GLB can seed the new cache after its checksum matches, without downloading the old GLB.

A cold browser still downloads the selected character once. Storage eviction, clearing site data, private mode or denied storage can require a later download. Cache tests cover concurrent duplicate requests, warm reloads, changed-animation-only files, and failed requests.

## 웹 전사 v3/v4 리소스 배포 규칙

통합 최적화 담당자가 공용 다운로드·캐시·빌드·배포를 관리합니다. 에셋/맵 담당자는 변경 파일과 검증 결과를 전달하고, 공용 런타임 및 `ArcherPreviewSite`를 동시에 수정하거나 서로 다른 빌드를 push하지 않습니다. 작업 중인 다른 변경을 `git add -A`로 함께 배포하지 않습니다.

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

자동테스트는 첫 묶음 다운로드, 캐시 재접속 0바이트, 한 파일 변경/부분 캐시, 맵 왕복, 손상·중단·저장공간 거부, 구버전 탭 보호 및 정리를 확인합니다. 실제 모델을 사용한 S23/iPhone 화면 크기 테스트도 유지합니다. 이는 실기기 통신 속도·발열 측정과 다릅니다.

설정의 성능 진단 결과를 복사하면 `resourceDownloads`에 JSON `revision`, `bundleRequests`, `fileRequests`, `extractedFiles`, `cacheHits`, `downloadBytes`가 포함됩니다. 캐시가 있는 재접속은 `downloadBytes: 0`이어야 합니다. 서비스워커 `RESOURCE_CACHE_STATS` 메시지는 `prunedFiles`, `cleanupDeferred`, `cleanupError`를 반환합니다. 브라우저 자동조작은 수행하지 않으며 실기기 검수는 사용자가 진행합니다.

2026-10-29 기본 시작 계획: 요청 241건 → 73건(묶음 33건). 전송 57,619,614 → 55,718,029바이트; 압축 플레이어 프로필은 78,114,058 → 76,212,473바이트. 현재 시작 위치/화면 조건의 계획 수치이며 실제 시간이나 모든 위치의 고정 용량은 아닙니다. 요청 사이 대기 시간이 주된 개선 대상이고 이미 압축된 큰 텍스처의 용량 감소는 작습니다.
