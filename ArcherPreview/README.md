# Moonforest Character Preview

## 2026-11-02 미니맵·벽면 등불·UI 위치·카메라 기본값

게임 루트의 모든 UI/캔버스에서 우클릭 메뉴를 막습니다. 창 밖 이동·포인터 취소·포커스 상실·화면 숨김·페이지 이탈·UI/네이티브 메뉴에서 이동/달리기/공격 홀드를 취소하며, 끊긴 키의 자동 반복으로 이동이 재개되지 않습니다. 다시 누르면 정상 조작합니다. 캔버스에서 정상적으로 차단한 우클릭 드래그는 이동과 함께 사용할 수 있으며, 바깥에서 놓친 포인터 해제도 창 수준에서 받습니다. 이벤트는 맵 입력 해제 시 함께 정리합니다. 진단 복사 버튼과 키보드 복사는 유지합니다. `input.test.js`·`game-selection.test.js`가 메뉴/창 이탈·조작 복귀·리스너 해제를 검사합니다.

비탄의 마녀는 사망 후 총 10초에 퇴장합니다. 5.2초 사망 모션과 0.65초 정착 자세를 보존하고 이후 4.15초 동안 몸체·외곽선·접지 명암이 함께 부드럽게 투명해집니다. 곰/고블린 등은 기존 5초 퇴장 시간을 유지하면서 같은 완만한 투명도 곡선을 사용합니다. glTF의 강제 불투명 재질도 죽은 개체만 알파 합성을 허용하며 살아 있는 공유 재질/원본 알파는 바꾸지 않습니다. 투명 셰이더 변형은 최초 숨김 준비에서 한 번 준비하고, 퇴장 중 추가 모델/재질/텍스처는 만들지 않습니다. 사망 보상 1회, 1→2단계 변신, 맵 왕복/재소환 복구를 자동 검사합니다.

숲·동굴 미니맵의 입구가 아래에 오도록 배경/충돌/포탈/화살표를 함께 회전합니다. UI테스트 상단의 이전 150% 폭/축소 규칙을 해제하여 설정 버튼이 잘리지 않도록 하고 전투 4버튼의 기준 위치와 방사형 간격을 원래 배치로 되돌립니다. 모양/기능은 보존합니다. 좁은 화면의 수첩·가방은 메뉴에서도 동일하게 열 수 있습니다.

기존 동굴 등불 20개를 실제 근거리 암벽/연속 지형 면에 부착하고 가까운 통로의 바닥에서 1.8m 위에 둡니다. 벽이 없는 구간은 사용자 승인에 따라 인접 구간으로 이동합니다(최대 약 12.18m). `scripts/place-cave-wall-lanterns.mjs`가 오프라인으로 실제 표면을 검사해 `src/cave-lantern-mounts.js`를 만듭니다. 원본 등불 모델/텍스처/LOD/개수는 유지합니다. 작은 철제 받침은 전체 480삼각형의 정적 배치 하나이며 새 텍스처·실시간 광원·그림자 패스가 없습니다. 불빛과 광륜은 새 높이를 사용하며, 벽면 광원은 앞쪽의 보수적 가림 영역을 벗어나되 뒤쪽으로 비추지 않습니다. 배치 변경 시 충돌·카메라·시야·보스 안전 영역을 다시 베이크합니다.

주인공·장비 기본 표현은 외곽선 보정 +0.15px, 내부선 0.04, 밝기 0.95입니다. 보스 기본값은 외곽선 0.30px, 내부선 0.30, 밝기 1.00입니다. 미조정된 이전 기본값만 갱신하며 사용자 지정 표현은 보존합니다. 이 대상 초기화로 새 기본값을 적용할 수 있습니다. 카메라 기본 범위는 1.20×~10.00×이며 이전 범위 설정은 새 기준으로 한 번 전환합니다. 이후 범위 수정/해제는 계속 저장합니다. 기본 초점은 160cm 주인공의 머리 높이(약 1.35m)를 지면 기준으로 유지하고, 모션 따라가기 체크 시 실제 머리 움직임을 따릅니다. 맵 이동/재시작 시 설정을 보존합니다. 플레이어 8K·배경 최대 4K·기존 LOD를 유지하고 검증은 Node/실제 모델/NullEngine으로 수행하며 브라우저 자동조작은 사용하지 않습니다.

## 2026-11-02 UI테스트 · 실제 게임 통합

`?character=ui-test` 또는 설정 → 캐릭터 · 장비 → **UI테스트 · 마을에서 시작**으로 진입합니다. 내부적으로 기존 전사 v3 마을을 사용하며 `uiTest=1`을 유지해 숲·동굴에서도 같은 UI를 확인할 수 있습니다. 일반 전사 v3/v4/v5를 다시 선택하면 기존 UI로 돌아갑니다. 기존 지도·주인공·보스·조이스틱·공격/차지·방패·회피·물약·포탈·전체화면 기능을 재사용합니다. UI 이미지를 실제 3D 배경으로 대체하지 않습니다.

첨부한 모바일 UI의 녹색/금색 버튼, 종이 패널, 도트 글꼴을 UI테스트에만 적용합니다. 새 모델·이미지를 생성하지 않습니다. 시안의 약 33MB 인라인 파일 대신 기존 UI 이미지 11장과 글꼴 2개를 약 1.5MB로 추출했으며, 공통 JS/CSS에는 작은 UI 코드만 포함하고 UI테스트에서 해당 요소를 만들 때 해시가 붙은 이미지·글꼴을 사용합니다. 새 비동기 엔트리로 엔진 청크를 재분할하지 않습니다. 플레이어 8K·배경 최대 4K·기존 LOD 및 리소스 JSON 버전은 변경하지 않습니다. 출처와 글꼴 라이선스는 `src/ui-test-art/`에 보존합니다. 추출 재현: `python scripts/import-ui-test-art.py <사용자 HTML 경로>`.

비전투 체험 순서:

1. **이야기하기** → 루미의 부탁 수락 → **사과 줍기** 네 번 → 다시 이야기하여 전달. 애플파이 2개·동물 먹이 2개·경험치 70은 한 번만 지급합니다.
2. 농부에게 성녀를 물으면 붕대 단서와 경험치 100을 기록합니다. **수첩(L)** 에서 의뢰·단서·추적 목표를 바꿀 수 있습니다.
3. **메뉴 → 테스트 상황 준비**에서 사과/쇳조각을 준비하거나, 전투가 없을 때 체력 120을 소모합니다. **가방(I)** 에서 파이를 사용하면 실제 체력을 최대 120 회복하며 가득 찬 체력에는 소비하지 않습니다. 빠른 사용 등록 후 **Z** 또는 별도 버튼으로 사용합니다. 기존 J 공격, E 물약, Q 동굴 살펴보기를 보존합니다.
4. 시작 화면·새로운 테스트 여정·초기화 확인·눌림 체험도 작동합니다. 기존 설정 창을 같은 톤으로 꾸미며 카메라/사운드/성능/장비/보스 패턴 설정은 그대로 사용합니다. UI테스트 항목에서 큰 글자를 적용합니다.

대화·수첩·가방은 네이티브 모달이며 열 때 누르고 있던 공격/이동을 해제하고 실제 전투/음향을 일시정지합니다. 닫으면 기존 루프에서 재개합니다. 가로/세로 안전 영역, 최소 터치 크기, 내부 스크롤, 키보드 초점과 동작 줄이기를 고려합니다. 테스트 의뢰/가방·골드·맵 위치는 `moonforest-ui-test:` 저장 공간을 사용하여 기존 플레이 저장을 덮어쓰지 않습니다. 장비·카메라·사운드 같은 일반 설정은 기존 설정입니다. 초기화는 테스트 의뢰와 가방만 초기화합니다.

검증은 `tests/ui-test-integration.test.js`의 실제 DOM 이벤트/상태/체력 통합 및 기존 전투·재시작·맵 이동 회귀로 수행합니다. `boss-settings-lifecycle`은 UI테스트 모달에서도 실제 보스 시전 시계가 멈추고 정상 복귀하는지 검사합니다. 브라우저 자동조작·실기기 시각 검수는 수행하지 않습니다. 배포는 기존 `build-village-site → sync-village-site → stage-pages` 및 해시 비교를 유지합니다.

## 2026-11-02 맵 이동·길찾기·재접속

마을·숲·동굴 우측 상단의 도트 미니맵은 기존 통로·충돌 정보를 96×96 지도에 한 번 계산합니다. 맵별 배경은 최대 세 장만 보관하고 위치·방향은 최대 10Hz, 실제 도트가 바뀔 때만 그립니다. 추가 3D 카메라·에셋 다운로드는 없습니다. 맵 이동 중 작업은 세대 번호로 취소하고 기존 조작 버튼·설정·전체화면 입력은 가리지 않습니다.

숲·동굴은 처음 들어오는 입구가 아래쪽, 안쪽으로 진행하는 방향이 위쪽이 되도록 지도 전체를 180도 회전합니다. 통로·방·충돌 마스크·포탈·플레이어 위치·방향에 같은 변환을 적용하며 좌우 반전은 하지 않습니다. 마을 지도와 실제 월드 이동·카메라는 유지합니다. 일반 화면과 UI테스트 모두 같은 미니맵을 사용합니다.

`moonforest-map-position-v1`에 맵별 안전한 위치·방향·카메라를 저장합니다. 이동 중 최대 2초마다, 화면을 떠날 때 한 번 저장하며 같은 값은 다시 쓰지 않습니다. 재접속은 해당 맵의 저장 위치를 복원하고 실제 포탈 도착은 도착 지점을 우선합니다. 사망·로딩 실패·벽 내부 위치는 저장하지 않습니다. 배치가 바뀌어 저장 위치가 막히면 같은 높이의 3m 이내 안전 지점만 탐색하고, 없으면 기본 입구를 사용합니다. 브라우저 저장 공간이 차단되거나 지워졌을 때는 기본 입구로 시작합니다. 이 데이터는 리소스 해시/캐시와 별도이며 배포 때 삭제하지 않습니다.

정적 에셋의 빈 glTF 루트에만 비싼 일반 복사를 생략합니다. 실제 메시·재질·변환·LOD는 기존 인스턴스를 사용하고 애니메이션·스키닝·모핑·특수 피벗 등은 일반 경로를 유지합니다. 모든 배포 정적 모델 162개의 원래 결과와 행렬·바운드·재질·지오메트리 일치를 검사합니다. 맵 해제 시 안개뿐 아니라 정적 명암 셰이더의 sampler도 텍스처 폐기 전에 중립 맵으로 바꿔 재진입 준비 대기를 막습니다. 늦은 작업의 세대 격리와 수동 재시도 정책은 유지합니다.

비탄의 마녀는 4.5m입니다. 기존 스케일에서 파생되는 피격·충돌·분리·HP·외곽선과 전방 내려찍기/돌진 거리·시야 범위를 맞추고, 실제 541개 포즈로 벽·천장 안전 영역을 다시 베이크합니다. 공격 속도 1.6배와 예고 시간·피해량·회피 규칙은 유지합니다.

동굴 랜턴은 주변 6.5m와 전방 최대 10.5m의 부드러운 원뿔형 밝기를 사용합니다. 카메라 대신 전사 위치 기준으로 먼 공기색을 계산하여 축소 시 불빛이 사라지지 않게 합니다. 벽 시야 마스크는 유지합니다. 통로 가장자리에 기존 랜턴 10개를 추가하여 총 20개이며, 기존 정적 명암 맵 64KiB에 반영합니다. 추가 실시간 광원/그림자 패스는 없습니다. 변경된 배치는 충돌·카메라·시야 베이크와 `witch-cave.json`의 배치 수를 함께 갱신합니다.

배포 시 전체 자동 회귀와 실제 압축 자원 맵 왕복·시간 초과 후 재시도·재질 수명·재접속·미니맵 검사를 실행합니다. 플레이어 8K·배경 최대 4K·기존 LOD를 보존하고, `build-village-site → sync-village-site → stage-pages`의 JSON 해시/부분 갱신 검증을 통과한 목록만 배포합니다. 브라우저 자동조작은 하지 않습니다. NullEngine 준비 시간과 인스턴스 CPU 비교는 S23의 실제 GPU·온도·2~3초 이동 보장과 구분합니다.

## 2026-11-01 17:24 동굴 플레이 영상 후속 보완

영상의 월드 HP·큰 펼침 진단창·옛 암벽 무늬는 현재 배포 UI와 달랐으므로 녹화 버전을 현재 코드로 단정하지 않습니다. 현재 소스에서 별도로 재현한 원인은 원본 양면 재질의 강제 단면화, 입구 landmark의 구조물 분류 누락, 제출된 높은 표면의 일부를 2D 시야 밖이라는 이유로 검게 칠하던 처리입니다. `tests/cave-open-surfaces.test.js`, 입구 실제 메시/카메라 검사와 `reports/cave-user-review-1724/`에서 근거를 확인합니다.

실제 열린 경계가 있는 원본 양면 에셋 8종만 양면 색상 면을 보존합니다. 닫힌 일반 벽·기단·종유석과 플레이어·보스의 정책은 유지합니다. 본체·외곽선의 LOD와 제출 일치는 계속 검사합니다. 입구를 통째로 나무처럼 디더 투명화하지 않으며, 실제 입구 삼각형을 카메라/시야 베이크에 포함합니다. 기존 몸 충돌·배치·바닥·보스 활동 영역은 보존합니다. 이미 제출된 암벽의 시야 경계는 원래 표면색을 저채도 암부로 남기고, 숨은 방/몬스터의 미제출과 먼 안개색 수렴은 유지합니다. 새 그림자나 추가 드로콜은 없지만 선별 양면의 fill 비용은 증가할 수 있으므로 이를 발열 감소의 증거로 취급하지 않습니다.

암벽의 검은 잔무늬 대비를 큰 면에 맞춰 제한하고, 높은 어깨 옆 낮은 벽의 정적 불빛 수신 높이를 보완합니다. 물리 바닥 높이를 담은 알파는 보존하며 물은 같은 명암 맵 조회에서 얕은/깊은 색을 구분합니다. 동굴의 과한 하단 화면 가림만 완화합니다. 원래 에셋 형상·UV·텍스처·LOD를 다시 만들거나 복사하지 않습니다.

거처·실험대·요아힘 제단에 가까이 있고 실제 소품이 로드되어 보이며 전투/로딩/사망 상태가 아닐 때만 ‘살펴보기’를 제공합니다. 기존 도움말 모달의 일시정지·음향·전체화면 흐름을 재사용하며 원래 조작 안내로 복구합니다. 버튼은 조이스틱 시작 영역 위에 두고, Q 또는 터치로 열며 관찰 중 HP·물약·장비를 변경하지 않습니다. 상시 목표 문구나 새 모델·이펙트는 추가하지 않습니다.

진단창의 구형 expanded 저장값·inline 크기를 정리해 탐색 중 두 줄만 표시하고 상세 기록은 모달에서 확인합니다. 설정의 긴 측정 설명은 접어 둡니다. 설정 → 현재 상태 → ‘업데이트 확인’은 누를 때만 같은 앱의 index.html 한 건을 받아 실행 중 bundle과 비교합니다. 자동 재접속·게임 초기화·캐시 삭제·모델 다운로드·반복 확인은 하지 않습니다. 배포 후 새 주소에서 실행 중 버전을 확인하며, 리소스 JSON 해시와 부분 갱신 절차는 계속 유지합니다.

플레이어 8K·배경 최대 4K·기존 LOD·카툰 표현을 유지합니다. 배포 전 전체 회귀, 실제 모델 회전/LOD/카메라, 모달 수명/맵 왕복과 자원 해시를 검증합니다. 브라우저 자동조작은 사용하지 않습니다. 오프스크린 GLSL·오프라인 이미지와 실제 S23/iPhone 화면·GPU·온도 측정은 구분해 기록합니다.

## 2026-11-01 동굴의 정적 명암과 먼 대체 지형 제출

암반의 반복 구멍 무늬를 만들던 월드 좌표 UV atlas 반복을 제거합니다. 큰 광물 색면과 원래 UV 디테일 25%를 혼합하며 가구·소품의 원래 UV는 유지합니다. 실제 등불 10개와 영혼 수집기 2개의 위치에서 정적 명암을 계산합니다. 작업대 자체에는 확인된 불꽃이 없어 광원으로 취급하지 않습니다. 새로운 동적 광원·그림자 패스·매 프레임 텍스처 업로드는 없습니다. 장면당 128×128 RGBA 맵 64 KiB를 사용하고, 왕복용 CPU 캐시는 장면 참조 없는 한 장 64 KiB만 유지합니다. 천장 1,600삼각형은 그대로이며 실제 노멀 약 10.7 KiB만 추가합니다.

플레이어·보스는 이 명암 플러그인에서 제외하고 기존 밝기와 엔진 안개색을 보존합니다. 환경·바닥은 중복 엔진 안개를 끄고 최종 색에서 22~48m의 어두운 공기색으로 수렴하며, 맵을 나가면 기존 재질의 안개 설정을 복구합니다. 완전히 안개색이 된 대체 지형만 AABB 최단거리 54m에서 미제출하고 50m에서 복구합니다. 카메라가 플레이어에서 24m보다 멀거나 요청 줌이 24m보다 넓으면 생략을 해제해 깊이 차폐를 보존합니다. 가까운 벽·실제 바닥·천장·기존 에셋 LOD는 바꾸지 않습니다.

20시점 NullEngine 제출 비교에서 대체 지형 draw 195→86, 삼각형 54,600→24,080이며 실제 지형·천장 제출은 동일했습니다. 세 대상만 합친 draw 301→192로, 전체 게임의 GPU·FPS·온도 개선 수치는 아닙니다. 정적 명암은 높이 한 장의 근사이며 높은 지형 옆 낮은 벽이 어둡거나 약 1.925m 이내에서 불빛 경계가 완화될 수 있습니다. 오프라인 비교에서 큰 암벽과 천장의 조형 가독성은 아직 목표 미달입니다. 이 변경을 동굴 구조 재시공 완료로 기록하지 않습니다. UV 왜곡으로 반려한 연구실 shell은 계속 비활성·미배포입니다.

배포 전 전체 회귀, 미준비 셰이더 쓰기, 20회 맵 왕복 재질/텍스처 해제, 원래 캐릭터 fog와 자원 해시를 검사합니다. 플레이어 8K·배경 최대 4K·기존 LOD와 JSON 부분 갱신 정책을 유지하며, 리소스 revision이 같으면 모델·텍스처·묶음을 다시 받지 않습니다. 브라우저 자동조작·추가 생성은 수행하지 않습니다. 실기기 GPU·발열과 최종 화면은 별도 검수 항목입니다.

## 2026-11-01 전투 화면 가독성 U1

전투 중 성능 진단은 두 줄 요약이며, 상세 기록은 일시정지 모달에서 확인합니다. 상세 모달에도 전체화면·닫기·진단 복사를 유지합니다. 모달/백그라운드 정지는 `일시정지`로 표시하며 성능0FPS로 해석하지 않습니다. 기본 조작 버튼 위치는 유지합니다. 주인공·주요 보스 HP를 별도 고정 위치에 표시하고, 5.7m 마녀와 근접하면 발 위치·방향 표식을 제공합니다. 표식은 현재 렌더 카메라에서 구조벽·천장·바닥 차폐가 없는 경우에만 표시합니다. 전사 스케일과 무관하게 방향 길이를 정규화합니다. 피해문자는 화면 충돌·노치·조작 영역을 피하고 최대24개 DOM을 재사용합니다.

기본 원거리 시점이 장애물 때문에 지나치게 가까워질 때만 같은 yaw에서 제한된 높은 눈 위치를 탐색합니다. 모든 중간 눈 위치는 기존 실제 암반/바닥/천장 검사로 확인하며 요청 배율·각도는 보존합니다. 적용 범위의 pitch/반경 경계에는 보정량 자체의 fade와 시간 보간을 적용합니다. 진단 JSON의 `cameraGuard`는 요청/유효 반경·각도·보정 이유를 구분합니다. viewport 크기/DPR가 그대로인180° 회전도 CSS safe-area를 다시 읽되 GPU 버퍼는 재할당하지 않습니다.

엘레나의 장판은 aim 때 지지 바닥·급격한 높이 단절·정적 장애물/차폐를 검사합니다. 벽으로 올라가는 삼각형은 표시와 피해에서 함께 제거하며 원래 해석 도형과도 교집합을 취합니다. 돌진은 그 범위 안의 실제 swept contact와 기존1회 접촉·회피 규칙을 유지합니다. 시전 시계와 속도는 바꾸지 않습니다. 이 정확성 검사에는 추가 CPU 비용이 있습니다. Node의 시전1회 중앙0.112→3.14ms, p95 0.275→8.18ms는 특정 CPU 검사 결과이며 실제 S23 지연·발열 개선 수치가 아닙니다. 지형의 최초 필드는 기존 맵 로딩의 navigation grid 준비에서 워밍하고 매 프레임 지형 재검사를 하지 않습니다.

연구실 P1-A 새 외피 후보는 미술 불합격으로 런타임/배포/카메라 충돌에 연결하지 않았습니다. 기존 동굴 배치·바닥·보스 이동·모델/텍스처·LOD를 보존합니다. 미승인 후보를 조용히 켜거나 보이지 않는 새 천장으로 카메라만 제한하지 않습니다. 다음 구조 변경은 별도 미술·기하·실제 전투 검수를 통과해야 합니다.

배포 전 `cave-readable-framing`, `cave-u1-app-wiring`, `combat-readability`, `diagnostic-detail-dialog`, `viewport-resize`, `elena-ground-surface` 검사와 기존 실제 모델/변신/사망/재시작/왕복 전체 회귀를 함께 실행합니다. `scripts/audit-cave-framing.mjs --protected <고정 protected-samples.json>`은 4,896개 기본 카메라 조건을 같은 분모로 비교하고 옛 허용 반경의80% 유지 여부와 벽 관통을 기록합니다. GPU·브라우저·기기 검수로 표현하지 않습니다. 기존 JSON 해시/묶음/캐시 배포 절차를 유지하며 코드만 바뀌면 플레이어8K·배경최대4K·기존LOD 리소스를 다시 패킹하지 않습니다.

게임 영역은 클릭·드래그·길게 누르기로 텍스트나 이미지를 선택하지 않도록 합니다. 선택 방지는 `#app` CSS와 `selectstart` / `dragstart` 두 위임 이벤트로 처리하며 pointer/touch/keyboard/click/scroll의 기본 조작은 중단하지 않습니다. 입력칸·기본 select·편집 영역·읽기 전용 진단 복사칸은 선택과 복사를 보존합니다. 루트에는 한 번만 등록하고 맵 왕복으로 늘리지 않습니다.

## 2026-11-01 GPU 진단과 동굴 외피 점검

기존 성능 진단에서 CPU 제출 시간과 GPU 시간을 분리합니다. GPU는 지원되는 WebGL elapsed-query 확장의 비동기 완료 결과만 읽으며 약 4Hz, 동시에 한 query로 제한합니다. 미지원·대기·무효·오래된 표본을 0ms로 취급하지 않습니다. 현재 프레임 시간과 GPU 표본은 동일 프레임의 동기 측정이 아니므로 합산하지 않습니다. 소환 비교도 완료된 고유 GPU 표본의 실제 측정 구간으로 구분합니다. 진단 off에서는 query/observer를 해제하고, 로딩·모달·숨김·사망 일시정지에서는 진행 중 측정을 취소합니다. 설정에서 진단을 복사할 때는 중단 직전 완료 기록을 현재 측정과 구분하여 보존합니다. 맵 이동·초기화·컨텍스트 손실에서는 이전 GPU 표본이 새 구간에 섞이지 않도록 비웁니다. `gl.finish`, fence 대기나 픽셀 readback을 사용하지 않습니다. Babylon 또는 엔진 경로를 바꾸면 WebGL1/2 확장, disjoint, 타임아웃, 일시정지/복구와 폐기 회귀를 다시 검증합니다.

동굴 미술은 배치 정리와 별개로 외피 문제가 남아 있습니다. 기준 `00dfce0`의 실제 근거리 메시에서 반복 벽은 외곽41·내부어깨14개이며, 천장은 1,600삼각형의 별도 돔/라이닝입니다. 외곽 벽 중심28곳에서 돔과 25cm 넘는 간격이 있고 최대 약11.27m입니다. 현재 천장 셰이더는 고정 위쪽 노멀·평면 투영과 원거리512px rock atlas 재사용이라 입체 동굴 표현을 보장하지 않습니다. 연속 외피와 카메라·시야·충돌을 함께 다뤄야 하며, 단순 연결면 추가는 기존 허용 카메라를 관통할 수 있습니다. 이번 GPU 진단 배포는 동굴 미술 재시공 완료를 뜻하지 않습니다. 플레이어8K·배경최대4K·기존 LOD·배치·메시·그림자·외곽선은 유지합니다.

## 2026-10-31 모바일 조작·동굴·보스 업데이트

- 전사 v3/v4/v5의 **소환** 버튼에서 몬스터 종류·수량을 선택합니다. 기존 소환 기능과 전체화면은 유지하며 모달은 전체화면 루트 안에 둡니다. 터치 화면에서는 키보드 안내·중복 설명을 숨기고 전투 상태 문구를 설정 안으로 옮깁니다. 성능 진단은 기본 요약과 **자세히**를 구분합니다.
- **설정 → 보스 전투**에서 곰·성녀·마녀별로 최대 12개 패턴을 순서대로 추가·이동·삭제합니다. 같은 패턴을 중복해서 쌓을 수 있으며 마지막 이후 처음부터 반복합니다. 순서 사용을 끄면 기존 자동 패턴으로 돌아갑니다. 설정은 이 브라우저에 저장합니다. 배속은 기존 기본 속도 기준 0.5–2배이며, 진행 중 공격은 그대로 완료하고 다음 공격부터 적용합니다. 애니메이션·예고·실제 피해가 같은 시계를 사용합니다. 마녀의 시전 기본 1.6배와 시전 사이 이동·돌진은 유지합니다.
- iOS Web Audio의 `suspended`뿐 아니라 `interrupted`도 복구합니다. 터치/클릭의 직접 입력 안에서 재개·무음 프라이밍을 수행하며, 설정/소환 모달을 닫거나 맵 로딩을 마칠 때 재생 정지 상태를 해제합니다. 지원 환경에서는 playback AudioSession을 사용합니다. 다운로드와 오디오 재개는 서로 기다리지 않습니다. 자동검사는 복구 흐름을 검증하며 실제 iPhone의 무음 스위치·출력 장치·백그라운드 복귀 음성 확인을 대신하지 않습니다.
- 타락한 성녀의 **모든 속성 및 모프 데이터가 바이트 단위로 동일한 정점만** 공유합니다. 삼각형 103,930개, 표면·UV·노멀·스킨·클립을 보존하면서 정점 207,979→158,730개, 정점 버퍼 약 2.44 MiB 감소, 모델 묶음 11,851,752→10,192,872 bytes로 줄였습니다. 이 검증 당시 r8 비탄의 마녀는 143,132삼각형/94,210정점이었으며 같은 방식으로 공유할 중복이 없어 메시 감량을 적용하지 않았습니다. 현재 r9 인계 차이는 아래에 기록합니다. 얼굴·손가락·보정 모프·실루엣을 보존합니다. 물리 기기의 FPS 향상 수치로 해석하지 마세요.
- 플레이어 8K, 배경 최대 4K, 기존 LOD/카툰/외곽선 정책을 유지합니다. 이번 성녀 최적화는 JSON manifest와 모델/버퍼 2개만 새 해시를 사용하며 기존 17개 의존 리소스를 재사용합니다. 코드 변경 때문에 텍스처·배경을 다시 받게 하지 않습니다. 배포는 아래의 JSON 의존성·묶음·변경 파일 검증 절차를 계속 따릅니다.
- 마법 명칭·12개 개별 원화는 검수용 외부 자료입니다. 원화를 게임 시작 다운로드에 포함하지 않으며 기존 바닥 예고와 피해 도형은 유지합니다.

동굴은 이동 영역 사이를 실제 암반으로 막고 가까운 카메라 차폐만 좁게 완화합니다. 플레이어 시야는 미탐험·탐험 기억·현재 시야로 구분하되, 비가시 영역을 검정으로 칠하지 않고 기존 암벽 텍스처를 공유하는 불투명 암반으로 표현합니다. 벽 너머 상세 지형·배경·보스·마법·외곽선·체력/피해/전리품 표시는 같은 시야 판정을 따릅니다. 보스 AI와 충돌은 화면 숨김과 분리합니다. 탐험 기억은 맵 왕복에 유지하며, 시야 마스크는 작은 고정 크기 텍스처를 공유합니다. 완전히 숨겨진 지형은 10,080삼각형 대체 암반을 사용하고, 일부라도 보이는 구역은 원래 지형만 제출합니다. 경계 정점은 원본과 동일하여 대체 암반과 상세 지형의 틈을 막습니다. 성능·자원 수·모달/소리·공격 시계는 CPU/DOM/NullEngine 회귀 검사로 검증하고 브라우저 자동조작은 하지 않습니다.

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


### 동굴 모바일 영상 검수 및 표현 설정 · 2026-10-31

`KakaoTalk_261031_013213.mp4`의 검정 공백·전경 벽 가림과 소환 후 프레임 저하를 기준으로 수정했습니다. 미탐험 암반/천장/외곽 안감은 이미 로딩한 `cave-01-eroded-wall`의 색상 텍스처를 빌려 쓰며, 별도 이미지 생성·다운로드·GPU 텍스처 복제는 없습니다. 비가시 지형 대체 면은 73,728→10,080삼각형으로 줄이고 각 지형 패치의 상세/대체 제출은 상호 배타적입니다. 멀리 있는 천장 바깥의 작은 안감은 128삼각형이며 보행/충돌/그림자에 참여하지 않습니다. 현재 보이는 플레이어와 보스까지의 앞쪽 시선 통로만 열고 뒤쪽 벽·다른 방·숨은 몬스터는 계속 가립니다. 카메라 각도 제한 해제에서 높아진 카메라 target 대신 실제 캐릭터 위치를 사용합니다. 마을·숲 리소스·기존 배경 LOD·보스 5.7m·충돌 배치는 그대로입니다.

마녀 애니메이터가 이미 계산한 자세는 접촉 단계에서 재사용합니다. actor/carrier의 이동·회전·스케일 또는 접촉 밀림이 있으면 다시 갱신하고, 원본 뼈·모프·49개 피격 부위와 시전/사망 시간은 유지합니다. CPU 표본은 같은 PC의 Node/NullEngine 측정이며 모바일 GPU FPS·온도 개선 수치가 아닙니다. 그림자 갱신 주기를 낮추거나 화면/텍스처 해상도를 줄이지 않습니다.

`설정 → 캐릭터 선 · 밝기`에서 주인공·장비와 보스를 별도로 선택합니다. 외곽선/내부선 켜기, 굵기/강도, 밝기와 대상 초기화를 제공하며 자동 저장합니다. 전사의 원본에 포함된 외곽선은 기본 ‘0 px 보정’, 밝기 1.0이며 엘레나는 기존 0.50 px·0.20·1.35입니다. 곰·고블린은 기존 표현 대비 보정하여 기본 외형을 유지합니다. 원본 그림에 이미 그려진 선은 지우지 않습니다. 조절은 셰이더 uniform 변경으로 처리하며 슬라이더 조작마다 모델·재질·텍스처를 새로 만들거나 셰이더를 다시 컴파일하지 않습니다. 모달 동안 게임 입력을 막고 전체화면은 유지합니다.

배포 전 동굴 셰이더·카메라 투영·패치 경계·공유 텍스처 수명, 반복 맵 왕복, 보스 전투/사망 및 모달/저장 검사를 포함한 전체 회귀 검사를 실행합니다. 동굴 판정·리소스 해시가 변경되지 않았음을 확인하고 기존 JSON 묶음 배포 절차를 따릅니다. 영상의 소환 비교에는 이전 표본 부족·시점 변경이 표시돼 있으므로 통제된 전후 측정으로 해석하지 않습니다. 최종 실기기 화면·GPU 시간·발열은 별도 확인 대상입니다.

### 타락한 성녀 엘레나 높이 · 2026-10-31

1단계 성녀는 원본 1.6m에서 1.7m로 조정합니다. `ELENA_SIZE`와 `elena.json`의 절대 스케일 1.0625를 사용하며 피격 캡슐은 실제 뼈 위치와 manifest 스케일을 따릅니다. 몸 충돌·소환 안전 간격·접지 표시·검수 초점·HP 표시를 맞추고 반복 소환으로 크기가 누적되지 않도록 검사합니다. 원본 메시·모션·텍스처는 다시 패킹하지 않으며, 2단계 비탄의 마녀 5.7m와 원래 마법 사거리·공격 타이밍은 유지합니다.

### iPhone 미준비 셰이더 uniform 오류 · 2026-10-31

실제 iPhone Safari 진단의 `this._uniforms[e]` 오류는 컴파일 대기 중인 Effect에 직접 uniform을 쓰는 경로로 재현했습니다. ShaderMaterial은 병렬 컴파일 중에도 pending Effect를 공개할 수 있으므로 `getEffect()`의 존재 여부만으로 GPU 쓰기를 허용하지 않습니다. 안개/바위의 프레임 갱신 helper는 material의 값만 보관합니다. 실제 bind/draw 단계에서 명시적으로 전달한 현재 Effect가 준비된 경우에만 GPU 값을 즉시 갱신합니다. 외곽선은 해당 submesh의 `_activeEffect`를 사용하고 공유 material의 다른 pending variant를 빌리지 않습니다. 그림자·선·텍스처·LOD 품질을 낮추는 우회는 하지 않습니다.

프레임 오류가 발생한 로딩 세대는 화면 준비/첫 프레임 대기 뒤의 성공 처리를 진행하지 않습니다. 초기 로딩·맵 이동의 대기 경계에서 실패를 다시 검사하고, 오류 화면은 명시적 `begin()` 재시도 전까지 `reveal()`로 숨기지 않습니다. 진단에 오류의 stack도 남기며 `failed=true`인 상태를 `ready=true`와 로딩 성공 기록으로 덮지 않습니다. `pending-shader-uniforms.test.js`는 실제 Babylon WebGLPipelineContext의 미초기화 uniform 표를, `startup-frame-failure.test.js`는 실제 앱 콜백/DOM의 로딩 중 오류와 재시도를 검사합니다. NullEngine의 동기 컴파일만 통과했다고 모바일 병렬 컴파일을 검증했다고 표현하지 않습니다.

### 숲·동굴 진입 방향 연속성 · 2026-10-31

포탈 이동은 출발 통로의 바깥 방향과 도착 통로의 안쪽 방향 차이만큼 캐릭터와 카메라·수평 화면 이동을 함께 회전합니다. 숲→동굴은 -45도, 복귀는 +45도이며 기존 마을↔숲의 180도 회전은 유지합니다. 화면에서 캐릭터를 보는 상대 방향, 상하 시야각·확대 배율·수직 화면 이동은 보존합니다. 보스 검수 진입점의 `elenaReview`는 일반 맵 이동 때 해제하여 도착 후 검수용 좌표·정면 시점으로 덮어쓰지 않습니다. 검수 주소를 직접 여는 기능은 유지합니다.

`cave-portal-facing.test.js`는 실제 출입 좌표·카메라 행렬·84개 방향 조합·40회 수학적 왕복과 실제 앱 콜백의 16회 맵 전환을 검사합니다. 체력·물약·장비·전체화면 모의 상태도 유지되는지 검사하며 실제 휴대폰 전체화면/방향 잠금 검증으로 표현하지 않습니다. 모델·텍스처·LOD와 리소스 JSON 해시는 변경하지 않습니다.

### 마녀의 동굴 생활·실험·부활 공간 정리 · 2026-10-31

기존의 통로 4개·수로·보스실 중심 `(29,-30)`/반경 14m/바닥 6m를 유지하고, 입구 쪽 거처 `(-30,19)`와 실험실 `(-35,-18)`, 안쪽 요아힘 부활실 `(29,-39.5)`로 소품의 역할을 구분합니다. 중복된 상하 암벽을 큰 단일 암반으로 정리하고 천장 장식과 기계 구간의 반복을 줄입니다. 기계는 통로 옆의 열린 두 구간으로 남기며 플레이어를 막는 새 기믹은 추가하지 않습니다. 부활실의 앞쪽 수집기·생활 가구를 옮겨 5.7m 마녀의 전신 움직임과 예고 장판 시야를 확보합니다.

`joachim-resting`은 기존 요아힘 원본에서 준비한 정지 자세 사본입니다. 근거리 48,722삼각형의 원래 형상·UV·색상을 유지하고, 검수한 중거리 39,272/원거리 28,438삼각형과 기본 1K/512/256 색상, 근거리 최대 4K ETC1S를 사용합니다. 별도 스킨·모프·애니메이션 갱신이 없으며 일반 환경의 스트리밍·그림자·외곽선·가림·해제 경로를 그대로 사용합니다. 새 Meshy/Tripo 생성이나 코인 사용은 없습니다. 원본 모델·근거리 파생본과 손상된 감량 후보를 구분해 보관하며, `scripts/pack-cave-joachim.mjs <승인된 lod-output.json>`은 해당 사본만 무손실 Meshopt와 KTX2로 패킹합니다.

바닥은 같은 2K 월드 맵에서 거처·작업 동선·부활실·배수 가장자리의 색을 부드럽게 연결하고, 기존 packed detail 텍스처와 두 샘플은 그대로 재사용합니다. 알파 64~255는 흙 마스크로, 투명도가 아닙니다. Blender 오프라인 검수에서는 `image.alpha_mode='NONE'` 또는 RGB 사본으로 읽어야 런타임의 `hasAlpha=false`와 일치합니다. 암반의 색 보정은 동굴의 rock 재질에만 적용하며 플레이어·보스·마을·숲 재질에는 적용하지 않습니다. 광원·그림자 패스·연무 중첩을 늘리지 않습니다.

배치나 모델을 바꾸면 `scripts/export-cave-layout.mjs --update-manifest` 및 필요한 바닥 베이크 뒤, `scripts/bake-cave-collision.mjs`와 `scripts/bake-mourning-cave-clearance.mjs --write`를 순서대로 실행합니다. 충돌·시야·카메라·보스 전신 자세 안전 데이터를 함께 갱신하고 세 공격·피격·사망·회피·왕복 회귀 검사를 통과해야 합니다. 배포는 기존 JSON 해시/묶음 절차를 사용해 변경된 바닥·요아힘 사본과 해당 manifest만 갱신하며, 원래 마을/숲/플레이어/보스 자원은 다시 패킹하지 않습니다. 오프라인 전체 배치 기하 상한의 감소를 실제 모바일 GPU·FPS·발열 개선 수치로 표현하지 않습니다.

넓어진 전투 공간의 반복 검사에서 돌진 초기에 전진한 뒤 플레이어 몸에 막히면 고정 진행 감시 구간을 두 번 기다리는 지연을 발견했습니다. 실제 3cm 순진행이 확인될 때마다 기존 0.28초 감시를 새로 시작하며 고정 돌진 목표·피해 게이트·예고/시전 시간·모션은 유지합니다. 실제 리그의 30/60fps, 정지/왕복/공전 및 예고/진행 중 물리벽 삽입 40시나리오에서 최대 정체 0.30초, 환경 관통·이전 장판 잔류·목표 변경 0, 돌진당 최대 피해 1회를 검사합니다. 이 시뮬레이션 시간을 휴대폰 실측 프레임 시간으로 해석하지 않습니다.

새 배치의 등불 광원이 시야에 들어오는 맵 왕복 검사에서 소프트웨어 인스턴스의 world 행렬 업로드 오류도 재현했습니다. Babylon 9.31 ShaderMaterial의 현재 draw Effect를 실제 glow bind 때 해당 메시의 non-UBO UniformBuffer에 연결합니다. 준비 대기·해제된 Effect는 사용하지 않으며 광원·알파 효과를 끄지 않습니다. `cave-glow-binding.test.js`는 인스턴스별 실제 world 값, 셰이더 재준비, pending/disposed 배제, WebGL2 INSTANCES 선언, 반복 맵 해제를 확인합니다. 실제 기기 동일 오류를 확인한 검사라는 주장은 하지 않습니다.

### 소환창 전후 성능 비교 표본 · 2026-11-01

소환 모달이 게임을 일시정지할 때 최근 프레임 표본도 지워져, 충분히 플레이한 뒤 소환해도 `baselineReady:false`와 `delta.*:null`이 기록되는 경로를 수정했습니다. 소환창만 열려 있는 동안에는 직전 3초 플레이 표본의 요약만 보존하고 메뉴 대기 시간을 프레임 간격에 넣지 않습니다. `baselineSource:'before-summon-menu'`와 `baselineAgeMs`로 출처와 표본 이후 대기 시간을 내보냅니다. 다시 플레이하면 현재 표본으로 대체하고, 맵 이동·숨김·다른 설정·사망·초기화는 이전 기준을 폐기합니다. 진단이 꺼져 있으면 추가 타이머나 수집을 시작하지 않습니다.

첫 동굴 입장처럼 실제 소환 전 플레이가 없을 때는 값을 만들지 않습니다. 등장 후 기록만 완료됐다고 표시하고 `comparisonAvailable:false`, 차이는 `null`로 유지합니다. `delta.jsUsedBytes:0`은 JS 메모리 사용량이 0이라는 뜻이 아니라 관측된 전후 사용량이 같다는 뜻입니다. `bossBackgroundLoads.elapsedMs`는 백그라운드 모델 준비 시간이며 FPS나 GPU 실행 시간으로 해석하지 않습니다. 배경 고해상도 텍스처 추정은 플레이어·기본 LOD·프레임버퍼와 다른 GPU 할당을 제외한 값입니다.

### 동굴의 숨은 성녀 대기 갱신 · 2026-11-01

동굴에서 시야나 렌더 거리 밖에 있고, 거처에 돌아와 단일 대기 모션이 완전히 정착한 1단계 엘레나만 본 샘플링을 보류합니다. 논리 시간은 계속 진행하며 처음 보이는 프레임의 몸체·외곽선·그림자·접촉 판정 전에 현재 시점의 원래 포즈를 복원합니다. 이동·전투·피격·사망·변신·검수와 2단계 마녀의 천·모프 갱신은 이 경로에서 제외합니다. 실제 모델의 93개 본, 첫 가시 프레임, 동일 프레임의 칼 피격, 재소환·맵 왕복·해제를 자동검사합니다. 원본 텍스처, 메시, LOD와 그림자 설정은 유지합니다.

이것은 숨은 성녀의 작은 CPU 낭비를 없애는 변경입니다. PC의 NullEngine 측정은 GPU·S23 온도·발열 감소를 증명하지 않습니다. 모바일 로그의 CPU scene/animation/contact 시간은 중첩될 수 있고, JS 메모리와 배경 고해상도 추정만으로 전체 GPU 메모리나 누수를 판정하지 않습니다. GPU 시간·온도가 없는 로그로 발열의 단일 원인을 확정하거나 화질을 낮추지 않습니다.

### 모바일 초기 자세·복귀와 반복 전투 검증 · 2026-10-31

캐릭터 로딩 때 실제 idle을 즉시 샘플링하고 첫 체력 UI까지 준비한 뒤 로딩 화면을 닫습니다. 로딩 완료 후 현재 문서/모달 상태에 맞춰 실행을 다시 맞춥니다. iOS 앱 복귀·포커스·WebGL 복구에서는 기존 실행 등록을 교체해 하나만 유지하며 첫 복귀 프레임의 시간 차는 0으로 시작합니다. 터치 시 1초 이상 실행 콜백이 끊겼다면 다시 등록합니다. 숨긴 문서·열린 모달·사망 화면·맵 이동·실행 오류 중에는 입력으로 게임을 재개하지 않습니다.

프레임 오류는 재시도 루프를 돌리지 않고 정지한 뒤 오류 문구와 명시적인 다시 불러오기 버튼을 표시합니다. 로딩이 끝나 숨겨진 오버레이도 오류 발생 시 다시 열어 초기 자세의 화면 뒤에 오류가 감춰지지 않게 합니다. 성능 진단 내보내기의 `lastFrameError`에서 마지막 실행 오류를 확인합니다. 실제 iPhone 오류 로그를 확보하지 못한 상태에서 사진만으로 특정 WebKit 결함이나 실기기 해결을 단정하지 않습니다.

검증에는 `ios-playback-recovery.test.js`의 실제 8K 전사/앱 render 콜백과 실행 복귀, `camera-follow-lifecycle.test.js`의 실제 맵 전환·사망/재시작·저장값, `mourning-repeat-timing.test.js`의 반복 장판/피해/회피/사망/맵 왕복을 포함합니다. CPU 자동검사를 실제 휴대폰 GPU·프레임·발열 검사로 표현하지 않습니다. 플레이어 8K·배경 최대 4K·기존 LOD와 부분 리소스 갱신 배포 절차를 유지합니다.

### 비탄의 마녀 공격 변형과 안정된 카메라 · 2026-10-31

기존 한쪽 팔 시전은 유지하고 `Chimera_Advance_Slam_3s`(전진 내려찍기)와 `Chimera_Alternating_Cast_3s`(큰팔·작은팔 교대 시전)를 추가합니다. 게임의 공격 상태와 1.6배 재생/예고 시간은 그대로 사용하며 `castVariant`로 실제 클립만 고릅니다. 격류는 원암, 부채·교차는 교대, 고리·낙인은 내려찍기를 사용합니다. 내려찍기는 미리 검사한 경로에서 최대 0.9m만 전진하며 착지 위치에 장판을 고정합니다. 이동 자체에는 피해가 없고 기존 1.65 클립 초의 장판 피해를 한 번 적용합니다. 처음부터 막힌 곳에서는 제자리 공격, 도중 새 장애물이 생기면 기존 예고/피해를 취소하고 새 행동으로 넘어갑니다. 사망 앞무릎은 역꺾임 없이 점진적으로 펴며 사망 5.2초와 원래 모프·후광 정지는 유지합니다. 추가 모프나 텍스처를 생성하지 않습니다. 새 자세는 카메라 경계/전신 동굴 여유 검사에 포함하고 원본 삼각형·가중치·UV·기존 원암 클립을 비교해야 합니다.

`설정 → 화면 · 카메라 → 캐릭터 모션 따라가기`는 기본 해제입니다. 기본 카메라는 실제 이동·지형 위치와 고정 1.05m 초점을 따라가며 달리기·점프·구르기의 머리 흔들림과 전투 대상 방향의 자동 초점 이동을 제외합니다. 체크하면 기존 머리/턱과 전투 초점 방식을 복원합니다. 선택을 저장하며 설정 중 즉시 반영하고 마을·숲·동굴 왕복에도 유지합니다. 동굴 카메라 보정도 기본 모드에서 이 높이를 유지하며, 사용자 줌·팬·상하 시야·전체화면 정책은 기존대로입니다. 기본 모드에서도 실제 이동이나 지형 경사를 따라가는 카메라 이동은 있습니다.

### 동굴 관통·회피 바닥 및 보스 GPU 제출 보강 · 2026-10-31

`video_2026-10-31_08-00-41.mp4` 후속 수정입니다. 넓은 시야 통로로 벽을 잘라내던 처리를 좁은 비상 통로로 제한하고, 카메라 자체가 근거리 암벽·실제 천장 삼각형·지형 안에 들어가지 않도록 보정합니다. 원래 줌/팬 요청값은 보존하고 장애물을 벗어나면 부드럽게 복귀합니다. `CaveCameraGuard.beginFrame()` → 시야/스트리밍 → `scene.render(false)` → HP/화면 투영 → `endFrame()` 순서를 지켜, 보정 전 카메라로 오브젝트를 숨기거나 화면 좌표를 계산하지 않습니다. 맵 밖에서는 기존 카메라를 그대로 사용합니다. 장애물 표는 실제 근거리 메시에서 오프라인으로 구우며 런타임 매 프레임 삼각형 레이캐스트나 새 GPU 텍스처를 만들지 않습니다.

회피 중 실제 머리 높이가 약 0.268m까지 내려가므로 바닥에도 시선 구멍이 생길 수 있었습니다. 평지·통행 경사는 ground shader의 시야 잘라내기에서 제외하고, 낮아진 회피 자세에서도 카메라 눈이 바닥 아래로 내려가지 않게 합니다. 미탐험 암반과 천장은 카메라 통로로 뚫지 않습니다. 기존 침식 암벽 14개를 벽 하단에 추가 배치하고 원래 암석 색상 결을 살립니다. 새 모델·텍스처는 없고, 새 충돌 4셀은 모두 원래 보행 불가인 벽 어깨입니다. 카메라/충돌/시야/마녀 전신 여유 표의 레이아웃 지문을 함께 갱신해야 합니다.

불투명 본체 뒤에 기존 외곽선을 그려, 본체가 덮을 검은 면이 먼저 그려지는 낭비를 줄입니다. 패스·해상도·외곽선·그림자 갱신 주기는 추가/축소하지 않습니다. 후광/천의 모든 정점에서 정확히 0인 마지막 뼈 가중치 항만 제외하고, 본체의 네 항과 모든 실제 가중치는 유지합니다. 비탄의 마녀의 화면 밖 본체/외곽선은 현재 뼈 행렬과 모든 0..1 모프 조합을 포함하는 보수적 경계로 제외합니다. 그림자 제출은 별개로 유지합니다. 지원하지 않는 데이터/모프 범위는 숨기지 않고 원래 그리기로 돌아갑니다. 정적 메시 경계나 일부 포즈만으로 애니메이션 메시를 숨기지 않습니다.

숨긴 이전 단계는 그림자 후보에서도 빼고, 살아 있는 보스의 맵 재진입 때 복구합니다. 처치가 끝난 보스는 접촉·분리 계산과 임시 벡터 생성을 하지 않습니다. 재소환용 모델은 기존 풀에서 재사용합니다. `boss-retired-work.test.js`는 두 단계 전투·맵 왕복·사망 후 120초·재소환을, `cave-dodge-floor.test.js`는 실제 76개 회피 자세와 바닥 10,944지점을 검사합니다. `mourning-camera-culling.test.js`는 실제 542개 생존/사망 자세의 5,123만 정점, 모프 조합·음수/비균일 축·최대 3px 외곽선 경계와 화면 밖 그림자 제출을 검사합니다. `audit-cave-camera.mjs`는 동선 106지점에서 카메라 30,528조합을 확인합니다. 이는 브라우저 자동조작이나 S23/iPhone GPU·온도 실측이 아닙니다.

플레이어 8K, 배경 최대 4K, 기존 LOD·모션·그림자·외곽선 품질과 모델/텍스처 파일 해시는 유지합니다. 코드/배치만 바뀐 경우 JSON 리소스 revision을 불필요하게 변경하거나 기존 리소스를 다시 패킹하지 않습니다. 전체 자동검사 → `build-village-site.mjs` → `sync-village-site.mjs` → `stage-pages.mjs` → `archer` Pages 배포 → 공개 변경 파일 해시 검증 순서를 유지합니다. 실제 휴대폰에서 화면을 크게 채운 보스의 GPU 시간과 발열 개선 폭은 별도 실측해야 합니다.


### 전사 160cm 및 단계별 보스 음악

현재 플레이어 전사(v2와 마을 v3·숲 v4·동굴 v5)는 `player-dimensions.js`의 1.60m 기준을 사용합니다. R6 원본의 부츠 밑면부터 머리카락 꼭대기까지 측정한 정자세 높이 0.9793707037m에 절대 배율 1.6337021252를 적용합니다. 리깅·장비·원본 8K 이미지·정점/가중치는 다시 패킹하지 않습니다. 원본 manifest의 `scale`은 이전 기준값이며 실제 월드 크기는 `configurePlayerSize`가 지정합니다. 맵 왕복이나 재시작마다 곱해서 줄이지 않습니다.

몸에 연결된 검·방패·망토·애니메이션 이동은 월드 행렬로 자연스럽게 함께 축소합니다. 칼·방패의 로컬 판정 좌표를 또 줄이지 않습니다. 이동 속도·회피 이동 곡선·발소리 간격, 이동 반경·적 접촉 간격·장판/돌진의 플레이어 반경, 공격 보조 폭·판정 두께, 카메라의 안정 중심·턱 대체 위치·시야 높이, 피격/회복 숫자와 바닥 표식은 동일 profile을 사용합니다. HP·공격력·회피 무적 시간·입력/공격 타이밍·저장된 카메라 옵션과 UI 터치 크기는 유지합니다. 공용 동굴 충돌 베이크의 높이 범위는 다른 몬스터도 사용하므로 보수적인 기존 범위를 유지합니다. `scripts/measure-player-height.mjs`와 실제 160cm 전투 회귀 검사로 확인합니다.

요아힘 신체는 동굴 배치와 live manifest에서 제거했으며 제단은 유지합니다. 삭제한 배치 ID는 예약해 뒤의 ID가 바뀌지 않게 합니다. 원본 제작 파일은 보관하고, 배포 그래프에는 제거한 body 파일을 남기지 않습니다. 보스 전신 안전 베이크는 배치 변경 후 반드시 갱신합니다.

보스 음악은 `elena_saint` / `elena_mourning` 항목을 `audio.json.music`에 등록할 때만 전용 곡을 사용합니다. 각 항목에는 실제 해시 URL·volume·정확한 `decodedBytes`가 필요합니다. 두 단계와 변신은 `audio.setBossContext`를 거쳐 1.2초 전환하며 사망·맵 이동 시 정리합니다. 음원이 없거나 실패하면 기존 보스 곡을 유지합니다. 엘레나 전용곡은 기존 방식과 동일하게 허가된 원곡을 오프라인 발췌·루프 편집합니다. Runway나 다른 AI 작곡 서비스는 사용하지 않습니다.

2026-11-02 적용곡은 Scott Buckley의 CC-BY 4.0 원곡을 편집한 〈꺼진 축복〉(A Dragon's Lullaby 2023 Remaster, 42–104초)과 〈비탄의 잔향〉(Balefire, 218–280초)입니다. 게임 내 별칭이며 새로 작곡한 원곡으로 표시하지 않습니다. 원본 연주·음정을 유지하고 2초 교차 편집과 음량 조정만 적용합니다. 두 곡 각각 60초, 32kHz 스테레오 MP3 128kbps, 961,388바이트, 디코딩 15,360,000바이트입니다. `scripts/edit-elena-music.py`가 원본을 별도 보관하고 해시·레벨·루프 경계·4배 재표본 피크를 검사합니다. `prepare-audio.mjs`와 `report-world-audio.mjs`로 JSON·크레딧·미리듣기를 함께 갱신합니다. 음악 원본을 다른 파일 이름으로 복제해서 전용곡으로 취급하지 않으며 기존 음원/효과음 해시를 유지합니다. 실제 스피커 청감은 자동 파일 검증과 별도입니다.

연구실 암반은 기존 제작 자료를 직접 다듬은 `cave-derived-laboratory-rock` 한 종으로 교체합니다. 승인된 원본 SHA, 지형 SHA, 교체 사각형과 배치를 `cave-laboratory-geometry.js`에 묶고, 가까움/중간/멀리 4,512/3,158/2,374 삼각형을 사용합니다. 이미지 텍스처를 추가하지 않으며 기존 다른 에셋 LOD는 변경하지 않습니다. 기존 암벽·기둥 두 유형만 동일한 월드 좌표 조건으로 색/외곽선/그림자에서 잘라냅니다. 이 방식은 기존 메시의 정점 제출까지 없애는 최적화가 아닙니다.

구조용 먼 LOD가 준비되기 전에는 기존 덮개를 유지합니다. 준비 후 새 암반이 천장·지형 덮개를 인수하며, 숨은 방의 밀폐를 위한 구조물 한 개는 별도 제출할 수 있습니다. 바닥 삼각형을 삭제하지 않고 비통행 어깨의 높이만 수정하며, 기존 보행 높이와 보호 정점의 GPU 법선은 유지합니다. 최초 로드 취소·새 맵 로드·장면 폐기 시 이전 요청은 새 맵 상태를 덮어쓰거나 자원을 되살릴 수 없습니다.

기존 몸통 충돌 표의 0.4m 격자를 새 암반에 그대로 적용하면 보수적 여유가 겹쳐 통행을 잘못 막습니다. 기존 표와 0.08m 정책을 유지한 채, 새 암반만 0.125m 격자 전체의 실제 삼각형 거리 하한을 미리 저장합니다. 실행 중에는 약 102KiB 표를 조회하며 메시를 다시 순회하지 않습니다. 새 모델/지형 변경 시 `bake-laboratory-collision.mjs`, `bake-cave-collision.mjs`, `bake-mourning-cave-clearance.mjs`와 보호 동선·카메라·보스 전신 검사를 함께 갱신합니다. 실제 근거리 모델 및 버퍼의 해시까지 베이크 지문에 포함합니다.

NullEngine의 재질 준비 성공은 실제 GLSL 컴파일 성공을 보장하지 않습니다. 변경한 색/외곽선/그림자 셰이더의 전처리 결과를 독립 GLSL 컴파일러로 검사하고, UBO 사용/미사용 경로를 모두 확인합니다. 이번 검사에서 예약어 인수 이름을 수정했으며 20개 셰이더 단계가 통과했습니다. 이것도 실제 휴대폰 드라이버·화면·발열 검수를 대체하지 않습니다.

최적화·가독성 개선을 이유로 기존 전투 표시 문구·언어·표시 순서를 임의 변경하지 않습니다. 피해 숫자는 원래 타격 위치에서 각 타격의 시간에 따라 연속으로 상승하며 자동 격자·가로 열로 재배치하지 않습니다. 원래 다중 타격의 `burstIndex` 오프셋만 유지하고, 후방 치명타 문구는 기존 `Critical`을 사용합니다. DOM 재사용·개수 제한·보이지 않는 피해 숨김은 표시 규칙을 바꾸지 않는 범위에서 유지합니다. UI 문구나 배치 정책을 바꾸려면 사용자 요청에 근거해야 합니다.

맵 전환 실패는 이동 중 플래그만 해제하고 실패 상태·화면·오디오 정지는 유지합니다. 명시 재불러오기가 완전히 성공한 뒤에만 실패 상태를 복구합니다. 복사 진단의 `mapTransition`은 현재 단계·경과 시간·이전 오류와 복구 여부를 기록합니다. 텍스처 취소 시 콜백 대기 Promise도 즉시 끝내야 하며, 마지막 참조인 자기 소유 InternalTexture의 scene 준비 토큰만 정리합니다. 공유 텍스처의 다른 소유자나 scene 전체 pending 목록을 임의로 지우지 않습니다. 이 처리는 고정된 Babylon 9.31 API와 실제 로드/반납 회귀로 검증합니다.

비탄의 마녀는 1단계 교전 후 기존 모델 하나를 숨은 상태에서 준비하고 실제 변신 때 활성화합니다. `prepareHidden`에서 공격·이동·보상·그림자 후보를 활성화하지 않습니다. 정확한 정점 경계·빈 가중치 슬롯 증명은 동기/비동기 경로의 연산 순서를 공유하고 512정점 블록으로 나눕니다. 각 구간은 1.5ms 목표·최대 4블록이며 실시간 상한 보장은 아닙니다. 메시 복제·애니메이터 초기화·GPU 드라이버의 한 호출은 여전히 더 길 수 있습니다. 준비 중 맵을 나가거나 즉시 변신/소환해도 같은 준비 작업을 합류·취소·재사용하며 외곽선이나 모프 매니저를 중복 생성하지 않습니다. 배경 준비 진단은 `jobId`로 완료를 대응시키고 취소 상태·작업 분할 통계를 별도로 남깁니다.

보스 화면 준비는 실제 본·모프·서브메시 변형의 준비 상태를 확인하며, 취소할 수 없는 엔진의 무기한 컴파일 대기 루프를 새로 만들지 않습니다. 전체 준비 기한은 45초이며 맵 이탈·숨김·새 요청 시 해당 작업의 대기·타이머·프레임 예약을 해제합니다. 완료가 늦은 이전 작업이 새 요청을 끝내지 못하도록 작업 번호를 대응시킵니다. 임시 셰이더 교체 정책은 성공·취소·시간 초과 모두에서 복원합니다. GPU 완료를 동기적으로 기다리는 `finish`·펜스·픽셀 읽기를 추가하지 않습니다. 드라이버 함수 한 번의 실행 자체는 JavaScript에서 도중에 끊을 수 없습니다.

동굴 환경 재질의 준비 순서는 toon → 동굴 명암/칠한 조명 → 시야 안개 → 셰이더 준비입니다. 첫 화면 뒤에 명암 플러그인을 붙여 밝은 변형을 다시 컴파일하지 않습니다. 원거리 엔진 안개도 환경 암부의 sRGB 기준색 `(0.024,0.028,0.038)`을 사용하며, PBR의 선형 변환은 엔진에 맡깁니다. 주인공 주변의 5.5m 환경 조명은 기존 현재 시야 정보와 3D 거리로 제한하고 기억 영역·벽 뒤·높은 천장을 추가로 밝히지 않습니다. 새 광원·그림자 패스·텍스처·샘플러를 만들지 않으며 캐릭터/보스의 사용자 밝기 옵션은 바꾸지 않습니다. 실제 ES100/ES300·UBO 경로의 42개 셰이더 단계 컴파일과 맵 반복 자원 검사를 유지하고, 실기기 화면·발열 평가는 구분합니다.

반복 왕복 검증은 합성 다운로드/오프라인 선해제 메시만으로 끝내지 않습니다. 실제 압축 glTF → Meshopt → 엔진별 디코드 캐시 → AssetContainer → 스트리밍 반납 경로도 확인합니다. 해제된 observer의 지연 제거 목록과 활성 observer를 구분하며, 정상 타이머 정리 후 같은 맵·같은 시점·같은 준비 단계끼리 자원 개수를 비교합니다. 이미지 디코딩·GPU 업로드를 대체한 CPU 검사는 실제 휴대폰 온도·GPU 메모리 검사로 표시하지 않습니다.

시야 텍스처의 R은 보이는 첫 벽까지 포함하므로, R만으로 랜턴을 켜면 벽 경계의 보간 영역에 빛이 샐 수 있습니다. 기존 RGBA8의 B에 `현재 보임 && 벽 셀 아님`을 저장해 추가 랜턴만 보수적으로 제한합니다. 기존 R/G 시야·탐험 기록·정적 횃불 명암은 유지하고 같은 한 번의 텍스처 조회와 업로드를 공유합니다. 첫 벽 셀의 추가 랜턴 밝기가 제한되며, 원래 1m 평면 시야 자료에 없는 얇은 구조물이나 정밀한 높이별 차폐까지 실제 그림자처럼 보장하지 않습니다. 맵 반납 시 retained material의 paint/fog/player uniform을 끄고, 재진입 시 새 맵의 텍스처와 플레이어에 연결되는지 실제 bind 경로에서 검사합니다.

야외 부유 입자 28개는 맵 전환 때만 활성 상태를 바꿉니다. 동굴에서는 위치·삼각함수·활성 상태의 매 프레임 갱신을 하지 않으며, 야외로 돌아오면 원래 시간·위상·진폭으로 동일한 메시를 재사용합니다. 이는 숨긴 효과의 CPU 낭비 제거이며 기기 발열 감소 수치로 환산하지 않습니다.

맵 모델의 논리 준비 기한은 건당 45초입니다. 리소스 준비·가져오기·glTF/Meshopt 도입·재질·외곽선 준비가 하나의 수명과 기한을 공유하며, 맵 반납/장면 폐기는 해당 소유자를 취소해 기다리는 Promise를 즉시 끝냅니다. 응답하지 않는 외부 디코더 Promise의 실제 종료를 기다려 반납을 막지 않습니다. 늦은 buffer-view 완료는 해당 수명의 취소 상태를 확인한 뒤 정점/GPU 생성으로 이어지지 않게 하고, 이미 생긴 부분 컨테이너와 정확히 소유한 자원만 폐기합니다. 공유 텍스처의 다른 소유자·엔진 전체 pending 목록·다른 맵의 배치와 파일 캐시는 지우지 않습니다.

시간 초과는 `TimeoutError / MAP_MODEL_TIMEOUT`이며 기한·에셋 ID·LOD를 진단에 남깁니다. 게임/오디오는 정지하고 로딩 화면에 시간 초과 안내와 ‘맵 이동 다시 시도’를 표시합니다. 자동 재시도는 하지 않습니다. 사용자가 누르면 실패한 동일 목적지만 다시 시도하고, 플레이어·체력·물약·장비를 다시 만들거나 이미 적용한 포탈 회전을 또 더하지 않습니다. 중복 클릭은 이동 중 잠금으로 막습니다. 실행 자체의 프레임 오류는 기존 전체 캐릭터 다시 불러오기 경로를 유지합니다.

일반 맵 기한은 응답 가능한 JavaScript 이벤트 루프에서 비동기 대기를 끝내는 장치이며, 동기 WASM·GPU 드라이버 호출을 중간에 끊지는 못합니다. 아래의 전용 디코더 감독기는 자신이 만든 worker만 실패/기한 초과 시 종료합니다. 이미 다른 코드가 설치한 외부 디코더와 worker 없는 경로는 임의로 종료·교체하지 않습니다. 영구 미완료·늦은 성공/실패·취소·장면 폐기·새 맵 도입과 실제 재시도 버튼을 함께 검증하고, 타이머·리스너·준비 항목·활성 자원이 남지 않는지 확인한 뒤 기존 JSON 해시/묶음 배포 절차를 따릅니다.

모델보다 먼저 수행하는 맵 목록·디코더 설정·바닥 KTX2 준비도 무기한 기다리지 않게 합니다. 실패한 공유 manifest 항목과 초기화 Promise는 해당 요청일 때만 제거해 수동 재시도가 가능해야 하며, 정상적으로 바이트가 늘어나는 전체 8K 다운로드를 단순 45초 총량 제한으로 끊지 않습니다. 바닥 작업은 시작 시의 장면·바닥 재질·지형·소유자를 캡처하고 성공 직전에 유효성을 확인합니다. 취소된 이전 작업이 새 `floorMaterial`이나 다운로드 진행 표시를 덮어쓰지 못하게 합니다.

Babylon 9.31의 KTX2 업로드는 디코드 완료 뒤 폐기 여부를 다시 검사하지 않습니다. 맵에서 정확히 폐기한 InternalTexture를 약한 집합으로 표시하고, 기존 KTX2 설치 단계에서 해당 텍스처의 후발 `_createTexture`만 취소 오류로 차단합니다. 마지막 단독 참조만 표시하며 다른 소유자가 남은 공유 텍스처는 정상 처리합니다. 전용 worker 감독기에도 이 정확한 소유권을 전달해 폐기한 맵의 진행 중/대기 중 변환만 취소합니다. 활성 텍스처의 업로드·포맷·밉맵·해상도·샘플링은 그대로입니다. 고정 버전 API와 실제 `_uploadAsync`의 후발 완료/공유/정상 경로를 검사해야 합니다.

### 맵 이동 실패 복구와 중복 준비 제거 · 2026-11-02

기존 SDK의 KTX worker 초기화 실패는 대기열의 슬롯을 점유한 채 Promise를 끝내지 않았고, 치명적 오류를 낸 worker도 다음 요청에 재사용할 수 있었습니다. Meshopt도 실패한 초기화 Promise와 응답하지 않는 내부 worker를 기본 인스턴스에서 계속 재사용했습니다. 기한 안내만 추가하면 수동 재시도가 같은 고장 상태에 다시 합류합니다. `ktx-worker-supervisor.js`와 `meshopt-worker-supervisor.js`는 각 한 개의 전용 worker를 소유하고 오류·메시지 오류·응답 기한을 확인합니다. 실패한 작업은 자동 반복하지 않으며 명시적인 다음 맵 준비/수동 재시도에서 실패 상태를 해제합니다. 기존 정상 외부 인스턴스는 보존합니다.

KTX는 출하 SDK의 worker 코드·설정·초기화 함수를 재사용하고, Meshopt는 JSON에 지정된 기존 해시의 디코더를 전용 worker 안에서 실행합니다. 원본 압축 파일·결과 포맷·정점/속성·밉맵을 바꾸지 않습니다. KTX의 소유자 표시는 worker 메시지·캐시 키에 넣지 않습니다. 한 번에 여러 텍스처를 폐기할 때는 취소를 모은 뒤 다음 유효 작업을 시작해 worker 생성/종료가 연쇄 반복되지 않게 합니다. Meshopt API에는 맵 소유자가 없으므로 한 맵의 취소가 다른 정상 공유 요청을 강제 종료하지 않습니다. 기존 논리 수명 검사는 늦은 모델 결과의 새 맵 반영을 계속 막습니다.

디코더 요청은 대기열 등록부터 초기화·변환 완료까지 총 45초이며, 단계가 바뀌어도 총 기한을 갱신하지 않습니다. 매우 느린 정상 작업도 이 기한에 걸릴 수 있으므로 대기·초기화·변환 시간을 별도로 기록합니다. 활성/대기 작업이 없는 경우에만 1초 뒤 전용 worker를 정리합니다. 기존 Meshopt의 유휴 정리가 진행 중 변환을 강제 종료한 것은 재현되지 않았으므로 원인으로 단정하지 않습니다.

새 맵 시작 때 한 번 확인/다운로드한 파일 목록은 그 시작 계획의 모델 준비에만 재사용합니다. 모델마다 CacheStorage를 다시 열고 동일 파일을 재확인하지 않습니다. 게임 중 추가 LOD·텍스처 요청과 다음 맵 이동은 실제 저장소를 다시 확인하며, 실제 로더의 파일 읽기와 네트워크 대체 경로도 유지합니다. 다운로드 완료를 가정하거나 영구적인 메모리 목록만 믿어 캐시 축출을 놓치지 않습니다. `resourceDownloads.initialPrefetchReusedFiles`로 제거한 중복 확인 수를 기록합니다.

저장소 열기/목록/조회/쓰기, 응답 헤더와 본문 전송은 30초 동안 진척이 없는 경우에만 중단합니다. 실제 바이트 수신·파일 저장·조회 완료가 있으면 기한을 갱신하므로 정상적인 긴 8K 전송에 30초 총량 제한을 적용하지 않습니다. 취소와 시간 초과 후의 옛 작업은 새 진행 표시나 새 캐시 항목을 삭제하지 않습니다. 실패 후 자동 다운로드 재시도는 없습니다.

하늘 이미지는 맵 준비와 함께 시작하고 최대 8초 무응답 시 기존 단색 하늘 대체 표현을 사용합니다. 성공한 원래 이미지는 그대로 재사용하며 기한 뒤 늦게 도착한 후보는 바인딩하지 않습니다. 화면 준비는 현재 카메라·선택된 LOD·현재 외곽선·실제 그림자 대상·후처리를 검사합니다. 숨긴 이전 보스와 사용하지 않는 전역 셰이더/준비 토큰을 기다리지 않지만, 현재 필요한 재질의 오류와 기한 초과는 오브젝트/재질 이름으로 보고합니다. 전역 준비 목록을 지우거나 현재 보이는 오브젝트의 준비를 생략하지 않습니다.

배포 전에는 실제 출하 KTX/압축 모델을 원래 디코더와 비교하고 결과 바이트 동일성, 고장/무응답/명시 재시도/공유 자원 보존, 옛 결과 격리, 실제 main 콜백과 재시도 버튼, 맵 왕복을 검사합니다. 전체 테스트 → 기존 `build:village` → JSON/해시 동일성 확인 → `sync:village`/`stage-pages.mjs` → `archer` Pages 절차를 유지합니다. 진단 복사에는 `ktxWorker`, `meshoptWorker`, `screenReady`, 다운로드 `waitStage`/`lastFailure`가 포함됩니다. CPU/VM/Node worker 검사를 실기기 GPU·온도·체감 로딩 시간 측정으로 표현하지 않습니다.

### 로딩 오류 원문·진단 복사와 브라우저 타이머 호환성 · 2026-11-02

로딩 실패 화면은 실제 오류 이름·메시지·코드·단계와 펼칠 수 있는 호출 기록을 표시하며, 설정/성능 HUD가 꺼져 있어도 ‘진단 복사’를 사용할 수 있습니다. 복사 내용은 실패 시점의 원문 오류·빌드 파일·기기 정보·다운로드/준비 단계·캐시/디코더 진단을 포함합니다. 자동 복사가 없거나 거부되면 같은 검정 화면 안의 선택 가능한 읽기 전용 입력란을 표시합니다. 보고서를 자동 전송하지 않습니다. 재시도 시작 시 옛 오류를 지우고 이전 복사 요청의 후발 완료가 새 화면을 바꾸지 못하게 합니다. 3D 초기화 자체가 실패한 경우에도 복사는 제공하고 작동할 수 없는 모델 재시도 버튼은 숨깁니다.

`57ce277` 사용자가 보낸 `index-D7c31AED.js:41:18373`의 `Illegal invocation`은 `MapLoadLifetime`이 Window의 `setTimeout`을 `this.scheduleTimer()`로 호출해 잘못된 수신 객체를 전달한 부분과 일치했습니다. Node 기본 타이머와 화살표 가상 시계는 이를 허용해 기존 검사가 놓쳤습니다. `runtime-timers.js`를 거쳐 기본 타이머는 `globalThis`, 주입된 시계는 자기 객체에서 호출합니다. KTX/Meshopt 감독기도 같은 수정을 적용합니다. 시간 제한·재시도·작업자 수·취소 정책과 품질은 바꾸지 않습니다. 브라우저 수신 객체 검사를 강제하는 회귀 검사를 기본 타이머 경로에 추가하며, 테스트 증거를 실제 브라우저/GPU 검수로 표현하지 않습니다.

### 동굴 퇴장 뒤 화면 준비 45초 실패 · 2026-11-02

`f32eb85` 실제 진단은 새 다운로드 0바이트, 준비/해제 362.1ms, 캐시 확인 400.9ms, 모델 1114.5ms였지만, 검·방패 `moonforest-character-outline` 준비 검사에서 45045.1ms 대기 후 실패했습니다. 원인은 동굴 시야 마스크를 폐기해도 살아 있는 플레이어/보스 ShaderMaterial이 그 텍스처를 참조했던 것입니다. `isReady`가 실패하면 `onBind`의 새 마스크 연결까지 도달하지 못합니다. 로딩 한도를 늘리거나 검사·외곽선을 끄지 않습니다.

동굴 런타임은 자신이 연결한 ShaderMaterial만 추적하고, 마스크 폐기 전에 살아 있는 재질의 샘플러를 장면 공용 기본 텍스처로 교체합니다. 숨겨진 보스 풀처럼 `scene.materials` 밖에 있는 재질도 포함합니다. 재질 폐기 시 추적을 해제하고, 맵 해제 시 observer/참조를 비우며, 늦은 이전 런타임의 bind는 현재 맵으로 넘깁니다. 실제 전투·카메라·셰이더 품질과 8K/4K/LOD·캐시 한도는 그대로입니다. 오류 안내를 호출하기 전에 이동 상태를 정리하여 복사 기록의 재시도 가능 여부도 실제 버튼과 맞춥니다.

`tests/map-screen-unblock.test.js`는 실제 무기 외곽선 그리기 → 동굴 해제 → 준비 검사를 수동 재연결 없이 실행합니다. 출하 플레이어의 메시·리깅·대기 동작을 유지한 12회 시야 마스크 왕복, 숨긴 재질·후발 호출·observer 수, 실제 준비 실패와 수동 재시도를 검사합니다. `reports/map-screen-unblock-2026-11-02/`에 수정 전후 동일 증상과 자동 검증을 보관합니다. 기존 3개 맵 실제 압축 모델 왕복, 최초 접속, 부분 캐시, 시간 초과/재시도 검사도 함께 실행합니다. NullEngine에서 텍스처 GPU 준비를 대체한 검증이며 실제 휴대폰의 전체 이동 시간을 2~3초라고 보장하는 근거로 사용하지 않습니다.

### 캐시 상태의 세 맵 왕복 검증 · 2026-11-02

맵에 돌아올 때 같은 장애물 경로 지도를 다시 계산하지 않도록 `map-navigation-cache.js`에 통행 비트와 이웃 연결 비트만 보관합니다. 최대 3개 맵·512 KiB의 데이터 상한이며 현재 세 맵은 339,659바이트입니다(작은 JavaScript 관리 객체 비용은 별도). 장면·모델·텍스처·navigator·경로·노드 객체를 붙잡지 않으며 도착할 때 독립적인 노드와 연결 목록을 복원합니다. 장애물·반경·범위 또는 충돌 메서드가 바뀌면 다시 계산하고, 인스턴스별 콜백과 비표준 격자는 저장하지 않습니다. 엔진 폐기 때 캐시도 비웁니다. `mapNavigationCache` 진단에 용량·적중·실패·최근 준비 시간을 표시합니다.

`map-navigation-cache.test.js`는 세 맵의 모든 노드·간선 순서·비용·연결 구역·경로가 기존 계산과 같음을 검사합니다. `map-three-way-repeat.test.js`는 실제 출하 압축 glTF와 WASM 디코더로 세 맵의 반복 도입/반납 및 기한 초과 뒤 명시 재시도를 검사합니다. `startup-frame-failure.test.js`는 실제 main 콜백의 왕복·재시도·지연 완료 격리를, `map-decoder-repeat.test.js`는 제어된 worker 응답으로 두 감독기의 고장/복구 수명을 반복 검사합니다. 증거는 `reports/map-warm-repeat-2026-11-02/`에 보관합니다. 테스트 자체의 mock 호출 기록이나 이전 컨테이너 참조를 메모리 누수로 오인하지 않도록 계측 수명도 제한합니다.

기존 8 MiB 기하·24 MiB 텍스처 CPU 캐시는 그대로입니다. 세 맵 전체가 이 제한 안에 들어가지 않아 일부 정점 재디코드와 장면 인스턴스 재생성은 남습니다. 로딩 단축을 위해 세 맵의 GPU 자원을 모두 상주시켜 메모리를 늘리지 않습니다. 플레이어 8K·배경 최대 4K·기존 LOD와 파일 해시를 유지하고, CPU/NullEngine 시간·객체 수·강제 GC 관찰을 S23/iPhone의 실제 로딩 시간·GPU 메모리·발열 보장으로 표현하지 않습니다.
