# MoonForest — Claude 작업 규칙

Babylon.js 9.31 기반 웹 3D 액션 RPG. 지금 만드는 것은 **MoonForest 0.3**이다.
목표: 시나리오 1장(전사 편)과 2장(엘레나 편)을 상용 품질로 완성한다.

이 파일은 매 세션 읽힌다. 짧게 유지하고, 상세는 아래 문서로 보낸다.

## 먼저 읽을 것 (이 순서, 필요한 것만)

1. `Docs/0.3/STATE.md` — 지금 어디까지 됐고 다음에 무엇을 하는지. **세션 시작 시 항상 읽는다.**
2. `Docs/0.3/PLAN.md` — 마일스톤과 범위. 작업이 범위 안인지 확인할 때.
3. `Docs/0.3/DESIGN.md` — 게임 설계(오프닝, 전투, 아이템, UI, 퀘스트). 해당 절만.
4. `Docs/0.3/ASSETS.md` — 보유 자산, 임시 블록 자산, 사용자에게 요청할 모델 목록.

`AGENTS.md`(68KB)는 0.1/0.2 시기의 이력 문서다. **통째로 읽지 않는다.** 늑대·곰 전투 판정처럼
기존 동작을 고칠 때만 해당 제목을 검색해서 읽는다. 과거 보고서(`Docs/Reports`, `ArcherPreview/reports`)도 같다.

## 권한과 원칙

- 코드베이스의 결정권은 Claude에게 위임되었다. UI, 인벤토리, 아이템, 전투 모션, 리깅, 모델 수정까지 포함한다.
  품질을 올리는 방향이면 기존 0.2 동작·수치를 바꿔도 된다. 바꾼 이유는 `Docs/0.3/CHANGELOG.md`에 한 줄 남긴다.
- **시나리오에 필요한 모델이 있으면 쓰고, 없으면 임시 블록 모델로 진행한다.** 임시 자산은 `src/v03/placeholder-actor.js`의
  레지스트리를 통해서만 만들고, 실제 모델이 오면 정의 한 줄만 바꿔 교체되게 한다. 없는 리소스는 `ASSETS.md`의 요청 목록에 올린다.
- 원본 보존: `Sources/`의 원본 모델·텍스처·모션은 덮어쓰지 않는다. 수정본은 새 파일·새 버전으로 추가한다.
- 0.1은 동결이다(`ArcherPreviewSite/index.html`, `deployment-files.json`). 0.2 진입(`moonforest-0.2.html`)은 계속 실행돼야 한다.
  공용 `src` 파일을 고칠 때 0.3 전용 동작은 `edition` 분기(`src/v03/edition.js`) 뒤에 둔다.
- 생성한 음원은 사용자가 승인하기 전에는 게임에 연결하지 않는다(이전에 반려된 이력이 있다).
- 커밋은 `warrior` 브랜치에 한다(원격 https://github.com/ranke0802/moonforest). 배포(sync)는 사용자가 요청할 때만 한다.
- 배포 브랜치는 `MoonForest`(구 `archer`)다. CI(`.github/workflows/pages.yml`)는 이 브랜치 push에서만 Pages로 배포한다. `warrior`는 작업 저장용이다.
- 배포 순서(2026-11-17부터): `warrior` 커밋을 `archer`(와 `MoonForest`)에 푸시하면 CI가 `scripts/ci-build-releases.mjs`로 0.2·0.3을 소스에서 빌드해 배포한다. 공유 리소스 그래프는 0.1 배포본(`ArcherPreviewSite/assets`)을 쓰므로 로컬의 미커밋 에셋 작업이 배포를 막지 않는다.
  로컬 빌드가 필요할 때만 `Publish-0.3.cmd`(Windows). 이때 `public/assets/resource-index.json`·`resource-sizes.json`이 배포본과 다르면 막히므로 백업 후 배포본으로 맞추고, 끝나면 되돌린다.
  `github-pages` 환경은 현재 `archer`만 배포를 허용한다(MoonForest 배포 단계는 설정 전까지 실패).
  배포 검증은 빌드 당시 소스 해시와 현재 소스를 비교하므로, 공용 소스를 바꾸면 0.2도 함께 다시 빌드해야 한다(스크립트가 둘 다 한다).
- 이 PC의 Linux 셸에서는 GitHub 접속이 막혀 있다. 푸시 방법: PC에서 `git bundle create .cache/v03-push.bundle origin/warrior..warrior` →
  파일을 클라우드 작업공간으로 가져와 `/home/claude/moonforest`(얕은 partial clone)에서 `git fetch <bundle> warrior:warrior` → `git push origin warrior`.
  원격 이력이 얕아 조상 관계를 모르면 `git fetch --filter=tree:0 --depth=N origin archer`로 이력을 늘린다. 강제 푸시는 쓰지 않는다.
- 브라우저 자동조작은 사용자가 허용하기 전까지 쓰지 않는다.

## 최적화는 기본 요구사항이다

새 기능은 성능 계획을 함께 가져온다. 아래를 먼저 쓰고, 직접 만든 우회로는 그다음이다.

- 반복 배치: thin instance, `InstancedMesh`. 움직이지 않는 것은 `freezeWorldMatrix()`, 재질은 `material.freeze()`.
- 많은 수의 단순 생물·군중: Baked Vertex Animation(VAT)과 thin instance. 개체마다 골격을 두지 않는다.
- 효과: 풀링한 `ParticleSystem`/`SolidParticleSystem`, 유한 용량, 단일 배치. 효과마다 RAF·타이머·RTT를 만들지 않는다.
- 배우: 종별 지오메트리·재질·텍스처 공유, 골격·애니메이터·상태만 개체별. `AssetContainer.instantiateModelsToScene` 계열 재사용.
- 표현 등급: 교전·근거리는 매 프레임, 비교전은 1/30초, 화면 밖·원거리는 1/15초 또는 동결. 판정·AI 상태는 항상 매 프레임.
- 셰이더·텍스처·버퍼의 최초 준비는 로딩/숨김 상태에서 끝낸다(`prepareModelShaders`, 공유 2ms 준비 예산).
- KTX2(UASTC)·Meshopt 유지. 새 텍스처도 KTX2로 준비하고 밉맵을 둔다.
- 프레임 핫패스에서 `new Vector3`, `clone()`, `filter/map`, 객체 펼치기를 쓰지 않는다. 모듈 수준 작업 변수를 재사용한다.
- DOM UI는 프레임마다 레이아웃을 읽지 않는다. `transform`/`opacity`만 바꾸고, 값이 바뀔 때만 쓴다.
- 새 Engine·Scene·프레임 루프를 만들지 않는다. 캐릭터 창·타이틀·컷씬도 기존 scene과 카메라를 쓴다.
- 품질 프로필 3단계(모바일 표준 / 모바일 고급 / PC 고급)를 기준으로 판단한다. 한 설정으로 모든 기기를 묶지 않는다.

근거 수치와 구조 문제는 `Docs/Reports/2026-11-17/MOONFOREST_독립_성능_그래픽_검토.html`에 있다.

## 다국어 (필수)

0.3은 한국어·영어·일본어·베트남어·중국어(간체) 5개 언어를 지원한다. 첫 실행 때 로고 전에 언어를 고르고(`moonforest-0.3.html`의 스플래시), 타이틀 설정에서 바꿀 수 있다. 저장 키는 `moonforest:lang:v1`이다.

- 플레이어가 보는 문구를 코드에 직접 쓰지 않는다. 한국어가 원문이다.
  - UI 문구: `src/v03/locales/ko.js`의 `ui`에 키를 추가하고 `t('키',{값})`로 읽는다.
  - 이야기 문구(대화·퀘스트·튜토리얼·팁): 한국어는 `src/v03/data/chapter*.js`에 쓰고, 다른 언어는 각 locale의 `story`에 같은 id로 쓴다. 런타임이 `localizeChapter()`로 덮어쓴다.
  - 공용 0.2 화면 문구: 한국어 원문을 키로 `legacy`에 번역을 넣는다(`tr()`). main.js의 `text()`·`toast()`와 미니맵 이름에 연결되어 있다.
- 새 문구는 같은 작업 안에서 5개 언어를 모두 쓴다. `tests/v03-i18n.test.js`가 빠진 키를 실패로 잡는다.
- 저장 데이터에는 번역된 문장 대신 키를 남긴다(`titleKey`, `placeKey`). 한국어 문장은 이전 기록 호환용으로만 함께 둔다.
- 화자 이름(`who`)은 한국어 키로 유지한다(원화 매핑). 표시할 때 `speaker()`로 번역한다.
- 글꼴: UI 픽셀 글꼴(Galmuri)은 한글·라틴 위주라 일본어·중국어·베트남어는 `v03.css`의 `html[lang=…]` 대체 글꼴을 쓴다. 새 화면도 `--v03-font`를 쓴다.
- 문장 길이가 언어마다 다르다. 버튼·말풍선은 고정 폭 대신 줄바꿈과 최소/최대 폭으로 만든다.
- 선택한 언어 파일만 내려받는다(locale별 동적 import). 한국어 외 언어 데이터를 기본 번들에 넣지 않는다.

## 코드 위치

- 진입: `ArcherPreview/moonforest-0.3.html` → `src/main.js`(공용 런타임) → `src/v03/boot.js`.
- 0.3 전용 코드는 전부 `ArcherPreview/src/v03/`에 둔다. `main.js`에는 연결 지점만 추가한다(이미 136KB다).
- 콘텐츠는 코드가 아니라 데이터로 쓴다: `src/v03/data/`의 퀘스트·대화·아이템·컷씬·스폰 정의.
- 테스트: `ArcherPreview/tests/v03-*.test.js` (node:test, DOM은 linkedom).

## 실행 환경 (중요)

- 사용자는 Windows에서 `Launch.cmd`로 개발 서버를 띄운다. 0.3 주소: `http://127.0.0.1:4173/moonforest-0.3.html`
- Claude는 Linux VM에서 이 폴더를 마운트해 접근한다. 여기서 되는 것: `node --check`, `node --test tests/<파일>`.
  **안 되는 것**: vite 빌드·개발 서버(네이티브 바인딩이 Windows용), npm 설치(네트워크 차단), 화면 확인.
- 따라서 화면·조작감·FPS는 "미확인"으로 보고하고, 사용자가 실행해 볼 항목을 짧게 적는다.
- 기존 소스는 CRLF다. 기존 파일을 고칠 때 줄바꿈을 보존한다. 새 파일은 LF로 써도 된다.
- 삭제는 기본적으로 막혀 있다. 지울 파일은 목록으로 보고한다.

## 작업 방식 (토큰 절약)

- 한 세션 = 목표 하나. 시작할 때 수정할 파일과 완료 조건을 정한다.
- 큰 파일(`main.js`, `asset-catalog.js`, `*-data.js`)은 통째로 읽지 않는다. `grep -n`으로 위치를 찾고 필요한 줄만 읽는다.
- 변경 범위의 테스트만 돌린다. 전체 회귀는 마일스톤 끝에 한 번.
- 작업이 끝나면 `Docs/0.3/STATE.md`를 갱신하고 `CHANGELOG.md`에 5줄 이내로 적는다. 작업마다 HTML 보고서를 만들지 않는다.
- 같은 대상을 두 번 고쳐도 사용자 검수를 통과하지 못하면 멈추고 기준을 다시 합의한다.
- 보고 형식: 바뀐 것 / 확인한 것 / 확인 못 한 것 / 사용자가 볼 것.

## 사용자에게 받을 수 있는 것

- 3D 모델: Tripo로 생성해 준다(2026-11-17 기준 1,475코인). 요청은 `ASSETS.md`의 우선순위 순서로 한다.
- Blender가 설치되어 있다. 리깅·모션 수정에 필요하면 연결을 요청한다.
- 컷씬 스튜디오(`cinematic-studio.html`)와 스토리보드 편집기가 이미 있다. 쓸 수 있으면 쓴다.
