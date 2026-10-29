# 전사 v3 · v4 · v5 공통 모바일 기준

전사 v3(마을), v4(마물의 숲), v5(마녀의 동굴)는 포털로 왕복하는 하나의 게임 흐름이다. 한쪽을 변경할 때 다른 맵의 로딩, 렌더링, 그림자, LOD, 캐시와 이동도 함께 확인한다.

- 플레이어: 원본 해상도 유지, 최대 8192. Galaxy S23 Chrome과 iPhone 14 Pro Safari/홈 화면 모두 동일한 기존 UASTC KTX2 패키지를 사용한다. 역사적인 manifest 이름 `warrior-v3-ios.json`과 콘텐츠 해시를 유지해 캐시를 재사용한다.
- 배경: 최대 4096, 기존 geometry LOD·ETC1S/UASTC·Meshopt 유지. 가까운 물체의 메시를 모바일이라는 이유로 추가 단순화하지 않는다. 고해상도 배경 텍스처는 기존 GPU 예산 안에서 필요할 때만 올린다.
- 세 맵의 모바일 렌더링 정책: 기존 30 FPS 상한, high DPR 최대 2, 1024 그림자와 근거리 외곽선을 공유한다. 카메라 회전 시 보이는 물체와 그림자의 누락을 검사한다.
- 맵 이동: 검정 로딩 화면을 먼저 표시하고 렌더링·이전 다운로드를 멈춘 뒤 이전 맵의 환경·지형·분위기 효과만 정리한다. 같은 문서의 scene/engine/WebGL 컨텍스트/player/camera/input을 유지하고 새 맵을 준비한다. v3/v4/v5 왕복에서 `location.replace`로 문서를 다시 열지 않는다. 전체화면·기기 방향·카메라 방향·체력·물약·장비를 유지하며 방문 기록도 쌓지 않는다. 단순 탭 숨김은 일시 정지이며 맵을 폐기하지 않는다.
- 캐시: 두 맵이 같은 `moonforest-resources-v1`을 사용한다. 콘텐츠 해시 URL에 배포 revision을 붙이지 않고, 완전히 받은 파일은 다시 받지 않는다. 취소·실패한 불완전 파일을 캐시하지 않는다. 처음 방문하는 구역과 삭제/만료된 브라우저 캐시는 추가 다운로드가 필요할 수 있다.
- 다운로드·텍스처 업로드는 기존 직렬 처리를 유지한다. 에셋을 추가 생성하거나 브라우저를 자동 조작하지 않고 Node/NullEngine 자동테스트로 검증한다. NullEngine 검증은 실제 기기의 GPU 렌더링, 발열, FPS 측정을 대신하지 않는다.

공통 회귀 테스트: `mobile-map-roundtrip`, `witch-cave-roundtrip`, `portal-polish`, `map-departure`, `resource-downloads`, `ios-player-memory`, `village-mobile-streaming`, `monster-forest-mobile`, `village-shadow-stability`, `optimization-lifetime`. 두 기기의 가로/세로 뷰포트와 v3/v4/v5 왕복을 포함한다. 배포 시 세 맵의 게시 리소스와 해시도 함께 검증한다. 상세 절차는 [기능 보존 검증 프롬프트](optimization-verification-prompt.txt)를 따른다.
