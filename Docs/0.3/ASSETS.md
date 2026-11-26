# 0.3 자산 현황과 요청 목록

## 보유 (바로 쓸 수 있음)

| 용도 | 자산 ID |
|---|---|
| 주인공 | `warrior-v3` (+ 모바일 4K/2K 프로필). 클립 9개: idle, run, attack, slash, judgment, shieldPush, dodge, knockdown, getUp |
| 몬스터 | `alpha-wolf`, 회색 늑대·늑대2·늑대3, 여우, 멧돼지, `guardian-bear`, `hooded-goblin` |
| 보스 | `elena`(인간형, 마법 모션 7종), `mourning-elena`(마물형) |
| NPC | `moonforest-resident2-blacksmith` 1명 |
| 건물 | `house-01~04`, `chapel`, `watchtower`, `well`, `market-stall`, 목책·돌담·문 |
| 소품 | `covered-wagon`, `handcart`, `crate-barrel-cluster`, `chest-common`, `cave-20-modest-cot`, `cave-18-alchemy-workbench`, `cave-19-apothecary-shelf`, `cave-15-resurrection-altar` |
| 단서 | `clue-journal`, `clue-bandage`, `clue-satchel`, `memory-locket`, `contaminated-vial` |
| 맵 | 마을, 대평원, 마물의 숲, 마녀의 동굴 |

## 임시 블록으로 진행 (모델이 오면 교체)

`src/v03/placeholder-actor.js`에 등록한다. 블록은 역할별 색과 머리 위 이름표를 갖는다.

| 대상 | 필요한 시점 | 블록 색 | 비고 |
|---|---|---|---|
| 마부 | M1 | 갈색 | 대사 2줄 |
| 여관 주인 | M1 | 주황 | 거점 NPC |
| 증언 주민 3명(노년 여성, 약초사, 청년) | M1 | 연두 계열 | 대장장이 모델을 색만 바꿔 임시 사용 가능 |
| 촌장, 촌장의 아들 | M5 / M6 | 회색 / 어두운 빨강 | 2장 핵심 |
| 요아힘 | M6 (꿈은 실루엣) | 파랑 | **2장 필수** |
| 비비앙 | M5 엔딩 | 보라 | **1장 엔딩 필수** |
| 홉고블린 | M5 | 초록 | 고블린 확대+색 변형으로 1차 대체 가능 |
| 구울 전사 | M5 | 회녹색 | |
| 고블린 궁수·주술사 | M5 | — | 기존 고블린의 장비·색 변형으로 제작(신규 모델 불필요) |
| 여관 내부 | M1 | — | 기존 집 외관 + 문 앞 상호작용으로 시작. 실내는 M5 이후 |

## 사용자에게 요청할 모델 (Tripo, 우선순위 순)

예산: 1,475코인. 외부 자료 기준 텍스처 포함 생성 1회에 약 40~45코인이므로 재시도 없이 약 30회, 재시도를 감안하면 **12~15개**가 현실적이다.
리깅·모션은 별도이므로 인간형은 **T자 또는 A자 자세, 단일 메시, 무기 분리**로 받아 Mixamo 자동 리깅을 쓴다.

| 순위 | 모델 | 이유 | 요청 사양 |
|---|---|---|---|
| 1 | 요아힘 (마을 전사, 20대 남성, 가죽 갑옷·장검) | 2장 전체와 꿈 오프닝 | A자세, 15~25k 삼각형, 2K 텍스처 |
| 2 | 비비앙 (마족 여성 마법사) | 1장 엔딩, 이후 장의 핵심 | A자세, 20~30k, 2K |
| 3 | 홉고블린 (대형 고블린 족장, 몽둥이) | 1장 숲 보스 | A자세, 20~30k, 2K |
| 4 | 구울 전사 (썩은 갑옷의 언데드 검사) | 1장 동굴 중간 보스 | A자세, 15~25k, 2K |
| 5 | 마을 주민 남 1 (농부·청년 겸용) | 증언·의뢰 | A자세, 8~12k, 1K |
| 6 | 마을 주민 여 1 (노년 여성) | 증언 | A자세, 8~12k, 1K |
| 7 | 여관 주인 | 거점 NPC | A자세, 8~12k, 1K |
| 8 | 촌장의 아들 | 2장 핵심 | A자세, 10~15k, 1K |
| 9 | 견습 성녀 엘레나(과거 의상) | 2장 주인공 외형. 없으면 현재 인간형에 색 변형 | A자세, 20~30k, 2K |
| 10 | 여관 간판·침대·식탁 세트 | 거점 연출 | 소품, 각 1~2k |

주민은 색·머리·소품 변형으로 6~8명까지 늘린다(모델 2~3개로 충분).

## 사용자에게 요청할 모션 (무료)

전사는 Mixamo 골격(`mixamorig:`)이다. Mixamo에서 **"Without Skin", FBX, 30fps**로 받아 주면 그대로 붙일 수 있다.

| 용도 | Mixamo 검색어 (후보) |
|---|---|
| 전투 대기 | "Sword And Shield Idle" |
| 3타 찌르기 | "Sword And Shield Attack" (찌르기 계열), "Stable Sword Outward Slash" |
| 방패 강타 | "Sword And Shield Block Impact" 대신 "Shield Bash" 계열 |
| 내려찍기 | "Sword And Shield Power Up" + "Great Sword Slash" 계열 중 내려찍기 |
| 돌진 베기 | "Sword And Shield Run" + "Sword And Shield Slash" (전진형) |
| 반격 | "Sword And Shield Casting" 아님 → "Sword And Shield Slash" 빠른 형 |
| 궁극기 | "Great Sword Jump Attack" 또는 "Sword And Shield 360 Attack" 계열 조합 |
| 주민 | "Talking", "Sitting", "Sweeping", "Farming" 계열 |

정확한 클립 이름은 Mixamo 화면에서 확인이 필요하다. 받으면 `Sources/actors/warrior-motion-0.3/`에 넣는다.

## 사용자에게 요청할 원화 (대화창 초상)

| 순위 | 원화 | 이유 | 요청 사양 |
|---|---|---|---|
| ~~1~~ | ~~마부 상반신 초상~~ | **받음(2026-11-26)**: `src/v03/portraits/coachman.webp`(490×504, sha256 719e8455…)를 `'마부'`에 연결했다. `'대장장이'`는 `driver.webp` 그대로. 원본 PNG를 `Sources/`에 등록해야 한다. | – |

## 요청한 UI 원화 (2026-11-26 톤 통일)

| 순위 | 원화 | 상태 |
|---|---|---|
| R1 | 상단 말 버튼, `menu-press-4x4.png` 1~3행 화풍(크림 #efe1b4, 선 셀의 4%, 번짐), 1024×256 4프레임 | **받음**: `src/v03/art/menu-press-ride-1x4.png` (sha256 c7a27af5…) |
| R2 | 기승 질주·하차 원판, `combat-press-4x4.png` 화풍(원판 80%, 면 #524937, 테두리 #dfb481), 1024×512 2행×4프레임 | **받음**: `src/v03/art/combat-press-ride-2x4.png` (sha256 44052740…) |
| R3 | (선택) 전체화면 아이콘 래스터 | 요청 안 함: CSS 선(둥근 끝, #efe1b4, 번짐)으로 대신했다 |

원본은 `Sources/ui/moonforest-hud/2026-11-26-ride-v1/`에 두고 `Sources/source-inputs.json`에 등록한다(미완료).

## 갤러리·타이틀용

- 로고는 글자("HYProduct")로 처리한다. 이미지 로고가 있으면 교체한다.
