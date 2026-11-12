# Portable project rules

- Treat this repository directory as the entire project. Derive paths from the owning script or an explicit repository root; never depend on old worktree paths, user-profile attachments, global caches, or an external asset directory.
- Keep every required raw source physically inside the repository, register it in `Sources/source-inputs.json`, and resolve asset workflow inputs through `Sources/resolve-source.mjs`. Historical origin paths are audit fields only; never use them as fallbacks.
- Preserve the root `Assets` tree: web tests and audio processing use repository-relative paths into it. Prepared runtime files in `ArcherPreview/public` remain available without re-running legacy raw asset generation.
- Require Node >=22.12, preferably 24. Use the included public Windows runtime when present; other platforms use installed tools. Do not refer to a private Codex runtime or copy private runtime packages into this project.
- Install application dependencies with `npm ci` in `ArcherPreview`. Its `node_modules` must be a real local directory. Do not introduce junctions, symlinks, external Git object alternates, or worktree `.git` pointer files as project dependencies.
- Use root `npm run dev`, `npm run build:village`, and `npm test` (or the same commands inside `ArcherPreview`). Root build uses the prepared-resource village builder. Do not run legacy repacking to solve ordinary setup/build/test work.
- Keep the portable launch and package commands working after relocation. Package through `Tools/portable/cli.mjs pack`; include required untracked source files, licenses, source hashes and standalone Git history. Application dependencies, generated builds, caches, temporary files and exports stay out. Bundled npm's own internal dependencies are the explicit toolchain exception.
- Reject source paths outside the repository and links/reparse points rather than silently following them. When changing portability tools, run `npm run portable:test` and `npm run portable:verify`; verify a fresh extraction for material packaging changes.
- Do not use browser automation for game validation. Describe Node/NullEngine, build and static HTTP evidence accurately; they do not establish real-device FPS, heat or GPU behavior.
- Preserve current approved game behavior, texture quality, LOD and combat input/timing unless the user explicitly asks to change them. Migration and packaging must not repack or downgrade art.
- Raw source folders and public Windows toolchain binaries are intentionally Git-ignored but must remain physical files here. Package.cmd inventories and includes them. A Git clone by itself is not the full authoring package; transfer the portable ZIP or the complete workspace.

## 최적화 가이드: 참조 범위

- 신규 몬스터·NPC·컷씬 작업에는 아래 공통 규칙과 [최적화·신규 콘텐츠 제작 가이드](Docs/Reports/2026-11-08/MOONFOREST_최적화_제작_가이드.html#read-first)를 기준으로 사용한다. 사용자의 구체적인 변경 지시는 이 기본 기준보다 우선한다.
- **281개 문서 아카이브는 필수 읽기 대상이 아니다.** 특정 문제의 과거 근거가 필요할 때만 검색한다. 아카이브의 과거 프롬프트·계획·시안을 현재 구현 또는 작업 지시로 취급하지 않는다.
- 배경 에셋 감량·신규 제작에는 [2026-11-09 배경 에셋 제작 기준](Docs/Guides/2026-11-09/MOONFOREST_배경에셋_제작기준.html)을 추가로 따른다. `#current`의 실제 적용 목록과 `#future`의 향후 기준을 구분한다. 2026-11-08 문서의 과거 배경 수치보다 현재 매니페스트와 이 추가 기준을 우선한다.
- **최우선 품질 기준 — 신규 생성·제작과 기존 에셋 최적화 모두 적용:** [배경 에셋 제작 기준 R2](Docs/Guides/2026-11-09/MOONFOREST_배경에셋_제작기준_R2.html#priority)의 실제 색상 텍스처·UV 왜곡 검사와 [신규 제작 기준](Docs/Guides/2026-11-09/MOONFOREST_배경에셋_제작기준_R2.html#future)을 모델·몬스터·NPC·소품 등 모든 새 에셋과 최적화 대상에 우선 적용한다. 숫자 목표에 맞추기 전에 실제 색상 원본과 후보를 정면·측면·사선 및 축소 거리에서 비교하고 UV 경계·늘어짐·뒤집힘·이음새·패딩과 떠 있는 형상을 확인한다. 신규 자산은 생성 원본과 승인된 디자인을 기준으로 한다. 실제 적용 현황은 매니페스트와 검증 결과를 확인한다.
- 사용자 승인 범주의 근거리 상한은 일반 바위 700, 풀 군락 1,500, 관목·가시덤불 2,500, 낮은 울타리 1,500, 돌담 2,500, 두 바퀴 손수레 2,500, 동굴 등불 1,500, 일반 동굴 암벽·암반 모듈 2,000 **삼각형**이다. 기존과 신규 모두 무조건 같은 비율로 줄이는 규칙은 아니다. 표준 모듈 외 구조·기능·실루엣이 다른 대상은 추가 검토 목록에만 올린다.
- **나무 전체, 천 덮개 짐마차, 집·예배당은 앞선 일괄 감량에서 제외되었으며 자동 감량 금지다.** 고사목 2,000삼각형 R2 후보는 이후 사용자가 별도 승인한 단일 예외이며 다른 나무에 확대하지 않는다. 퇴짜 맞은 나무 3,000·천 덮개 짐마차 2,500 시안을 승인된 제작 기준으로 재사용하지 않는다. 원본 텍스처·플레이어·보스·전투 동작과 기존 LOD 거리/단계를 유지한다. 특수 연구실 지형 셸과 여러 집·나무가 합쳐진 외경을 단일 일반 바위로 분류해 감량하지 않는다.
- 원본/기존 리소스 삭제는 사용자가 적용본을 검수하고 별도로 결정할 때까지 하지 않는다. 승인 후보와 전후 매니페스트는 `Sources/environment/approved-geometry/2026-11-09`에 보존하고 레지스트리로 접근한다. 기존 `.moonmap`의 에셋 배치 버전은 검증된 승인 교체에 한해 유지하며 실제 파일 `contentHash`는 새 값으로 기록한다.
- **비탄의 마녀 컷씬용 고품질 원본 보존:** `Sources/actors/mourning-motion/models/r10-original-da215cd8.glb` 및 관련 원본·텍스처·리깅/모션 작업 파일을 삭제하거나 현재 게임용 감량 모델로 덮어쓰지 않는다. 이 원본은 향후 컷씬용 후보이며, 컷씬에 이미 연결되었다는 뜻은 아니다. 컷씬 연결 시 최신 승인 포즈와 모션 호환성, 화질·메모리·해제 소유권을 별도 검증한다.
- **향후 감량·최적화의 필수 검수 기준:** 실제 원본 색상 텍스처를 입힌 원본/후보를 동일 카메라의 정면·측면·사선에서 확인한다. UV chart 경계 혼합, 무늬 방향 반전·늘어짐, 이음새와 떠있는 부품을 검사하며 필요 시 checker와 표면 대응 UV 오차를 함께 확인한다. 텍스처 파일 해시나 남긴 정점의 UV 바이트가 같다는 사실만으로 무늬 보존을 통과시키지 않는다. 원본 이미지·승인 해상도는 보존하고, 후보용 색상 재투영/베이크를 사용하면 별도 파일·출처·해상도·실제 차이를 기록한다. 이 경우 원본과 픽셀 동일이라고 표현하지 않는다. UV를 재배치한 후보는 배포 전 각 LOD와 모바일/고해상도 텍스처 프로필의 매핑 일치, 아틀라스 여백과 축소 시 이음새까지 검증한다. 눈에 띄는 왜곡을 남긴 채 삼각형 상한을 맞추지 말고, 품질 보존 대안의 실제 수치와 예산 초과 여부를 명시해 검수한다. 이 규칙은 검수 기준이며 기존 모든 에셋을 재검증 완료했다는 뜻이 아니다.
- 매 작업마다 HTML 전체, 내장 JSON, 에셋 85개 또는 최적화 사례 29개를 통째로 읽지 않는다. 이 파일의 공통 요약을 먼저 적용하고, 필요한 경우에만 HTML에서 해당 절·자산·사례의 텍스트를 추출해 읽는다. 문서 확인을 위해 브라우저 자동조작을 사용하지 않는다.

| 작업 | 필요한 가이드 절 |
| --- | --- |
| 신규 몬스터·NPC | R2 `#priority`, `#future` 및 공통 `#new-actors`, `#toon`, `#pipeline`; 마무리 시 `#handoff`의 관련 항목 |
| 컷씬·컷씬 템플릿 | `#cinematic`; 새 배우를 추가할 때만 `#new-actors` 추가 확인 |
| 특정 에셋·텍스처 예산 | 해당 `#asset-<assetId>` 항목; 필요할 때만 `#textures` |
| 알려진 성능 문제 재발 | `#cases`에서 해당 사례만 확인 |

### 현재 구현: 확인하고 보존할 사항

- 가이드의 현재 구현·수치는 **2026-11-08 / 커밋 `f25b5a8`의 스냅샷**이다. 작업 시점의 소스·매니페스트·등록 데이터가 사실 확인의 기준이며, 오래된 문서 수치에 맞추려고 현행 코드를 되돌리지 않는다.
- 승인된 외형·집/보스 텍스처·기존 LOD·전투 입력/타이밍/판정을 보존한다. 성녀의 승인된 56,918삼각형 같은 기존 예외에 신규 권장 예산을 소급 적용하지 않는다.
- 기존 카툰·외곽선·내부선 경로를 재사용한다. PBR 외형을 비활성화한 것과 `PBRMaterial` 자체를 제거한 것을 구분한다. 표면 내부선과 NPC의 공유 normal/depth RTT·합성 패스도 구분하며, 내부선을 비용 0으로 계산하지 않는다.
- 기존 단일 scene/engine/frame loop, 공유 가능한 자원, 증분 준비, 캐시/인구/메모리 상한, generation·취소·해제 소유권을 유지한다. 신규 배우마다 별도 Engine·RAF·상시 타이머·개별 내부선 RTT를 만들지 않는다.

### 신규 콘텐츠: 앞으로 적용·검증할 기준

- 아래 수치는 **신규 제작의 권장 시작 예산**이며, 현행 자동 제한 또는 이미 달성한 결과가 아니다. 일반 몬스터는 근거리 10,000~30,000삼각형 우선, 50,000 수준은 중요 실루엣/역할에 따라 검토한다. 일반 NPC는 10,000~25,000삼각형, 재질은 1~2개, 신규 일반 배우 텍스처는 1K~2K를 우선 검토한다. 초과가 필요한 경우 실제 수치·이유·검증 범위를 기록하고 승인된 품질을 유지한다.
- 등록 시 삼각형·정점·primitive/재질·관절/스킨·morph·클립·LOD·텍스처 해상도/형식/파일 크기를 기록한다. 원본과 라이선스는 canonical `Sources`에 보존하고 레지스트리에 등록한다. 파일 크기·JS 힙·추정 GPU 상주량을 같은 수치로 취급하지 않는다.
- 자산 ID/version/hash, 배우 정의, 스폰·충돌·피격·보상·리젠 소유권과 인구/준비 동시성/메모리 예산을 연결한다. geometry/material 공유와 배우별 rig·포즈·상태 독립성을 함께 지킨다. 필요한 신규 LOD·거리별 갱신 정책은 실제 구현·검증 후 적용된 것으로 기록한다.
- 최초 셰이더·버퍼·텍스처 준비가 소환·변신·최초 타격·사망 프레임에 집중되지 않게 기존 준비 경로를 사용한다. 맵 이동·시간초과·재시도·도구 OFF 뒤 늦게 끝난 작업은 새 맵/세션에 붙이지 않고 정리한다.
- 컷씬은 등록 자산을 참조하는 파일 → 스튜디오 수정 → 검증 → 로더/레지스트리 등록 흐름을 사용한다. 기존 카메라/scene/frame loop와 bounded actor host를 재사용하고, seek·skip·완료·오류·맵 변경 시 복귀/해제를 검증한다. 곰 테스트 샘플은 실제 게임 콘텐츠로 자동 등록하지 않는다.

### 검증과 기록의 구분

- 결과를 **현재 구현 / 과거 관측 / 신규 권장 기준 / 미측정·미확정**으로 구분한다. 개발 도구의 인구 상한이나 포맷 상한을 실기기에서 지원하는 동시 등장 수로 표현하지 않는다.
- 변경 범위에 맞는 자산·입력/판정·수명·취소·반복 검사를 수행한다. 공용 렌더/맵 수명 경로를 바꾸면 네 맵의 관련 회귀도 확인한다. 실기기 자료가 없으면 FPS·발열은 미측정으로 남기고 Node/NullEngine 통과로 대신 주장하지 않는다. 관측 빈도에 분모가 없으면 발생률을 만들지 않고 실행 주기·재현 조건과 구분한다.
- 새 기능이 실제로 적용되면 근거와 검증 범위를 기록한다. 정책 가이드를 갱신할 때는 현재 구현과 향후 기준을 계속 분리하고, 새 날짜/버전의 가이드로 링크를 갱신한다. 이전 날짜의 아카이브는 과거 기록으로 보존한다.

### 2026-11-09 수동 소환·준비 경로

- 소환 메뉴의 일반 수동 경로는 곰·고블린·타락한 성녀·비탄의 마녀를 **종류/단계별 1~20마리**, 네 맵 모두에서 지원한다. 동굴의 자동 스토리 거처·변신 경로와 구분한다. 개발자 ActorPopulation·컷씬의 별도 총인구/메모리 예산을 이 메뉴 상한으로 덮어쓰지 않는다. 메뉴 상한은 실기기 20마리 전투의 FPS 수용 인증이 아니다.
- 보스 모델 라이브러리는 수정하지 않은 공유 템플릿을 유지하고 배우마다 독립된 root·skeleton·animation target·morph influence를 복제한다. 엘레나 한 개체의 live container를 모든 소환이 공유하는 예전 singleton/adopt 방식으로 되돌리지 않는다. geometry·재질·색상 텍스처와 불변 morph 배열은 공유하되, Babylon 소유권 계약이 없는 GPU morph 저장소를 강제로 공유하지 않는다.
- 준비 단계는 기존 시간/작업 수 예산 안에서 합치며 취소·deadline·필수 GPU/프레임 장벽을 유지한다. 대량 소환은 포즈·초기 상태를 숨긴 채 분할 준비하고, 전체 성공 후 본체·그림자를 함께 활성화한다. 이미 준비된 animator는 공개 reset 계약으로 재사용한다. 실패·맵 이동 뒤 새 맵에 늦게 붙지 않도록 검증한다.
- 동굴 대형 배우의 배치 순서 보완은 기존 인증 안전 셀·몸 반경·플레이어/다른 배우 간격을 유지한다. 안전 공간이 없는 요청을 겹쳐 놓기로 해결하지 않는다. 소환 단계 벽시계 시간과 준비 CPU·프레임 대기 시간은 구분하며 `reports/summon-preparation-2026-11-09/model-preparation.json`의 합성 대기를 실기기 시간으로 표현하지 않는다.

### 2026-11-12 현재 구현: 우두머리 늑대 R8

- 소환 메뉴와 몬스터 배치 도구에 `alpha-wolf.r8` / `alpha-wolf`가 연결되어 있다. 원본 `wolf-attack-r8`와 파생 `wolf-game-r8`는 별도 등록하며 R7/R8 파일을 덮어쓰지 않는다. [통합 결과와 검증 범위](Docs/Reports/2026-11-12/MOONFOREST_우두머리늑대_R8_통합결과.html)를 참고한다.
- R8은 25,080삼각형·28관절·12클립·Breath 1개·승인된 4K 색상 텍스처를 유지한다. 공용 카툰·외곽선·내부선과 별도 `wolf` 표현값을 사용한다. 다른 보스의 기본값이나 저장값에 합치지 않는다.
- `WolfAnimator`는 개체 수명 동안 고정된 채널 표를 재사용한다. 수평 root 이동과 yaw만 actor/carrier에서 한 번 처리하며 원본 root pitch와 pelvis/chest 도약 이동 키를 유지한다. Babylon의 `__root__` Mesh까지 포함해 부모 순서로 포즈를 갱신한다.
- 전투·자원 수명은 기존 공용 경로를 사용한다. 제압 검수용 좌표로 플레이어를 순간이동하지 않는다. 준비 중 취소·반복 소환·네 맵 재사용과 실제 접촉·사망 보상은 Node/NullEngine에서 검사했으며, 실기기 20마리 60FPS·발열 달성을 뜻하지 않는다.
