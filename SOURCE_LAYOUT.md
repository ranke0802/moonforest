# 소스 구조와 빌드

Assets/Scripts/Player: 플레이어 입력, 직업 모델, 접지 보정
Assets/Scripts/Combat: 직업 전투, 스킬, 지형 발사체
Assets/Scripts/Effects: 이펙트, 데미지 텍스트, 조준/스턴 표시
Assets/Scripts/Enemies: 슬라임/꿀벌 공통 로직, 달늑대와 이벤트
Assets/Scripts/World: 숲 설정, NPC/오브젝트, 횃불, 기존 연습장 컴포넌트
Assets/Scripts/UI: UI, 번역, 미니맵, 개발자 설정
Assets/Scripts/Core: 진행도와 저장/세션
Assets/Scripts/Camera: 카메라 조작
Assets/Scripts/Diagnostics: 현재 UX 실행 검증 (--ux-verify 출력경로)
Assets/Editor/Build: ForestSetup.Deliver 빌드, RollDirectionFix.Run 구르기 클립 검사/보정

기존 MonoBehaviour의 파일명과 .meta GUID를 유지해 씬/프리팹 연결을 보존했습니다.
과거 일회성 생성/검증 코드는 Tools/Archive/pre-ux-v48-sources.zip에 있습니다. 과거 생성 스크립트를 다시 실행하면 현재 아트/설정을 덮어쓸 수 있으므로 필요할 때 내용을 확인하세요.

빌드: Unity -batchmode -quit -projectPath <프로젝트> -executeMethod ForestSetup.Deliver --v4-build-output <출력.app> -logFile <로그>

MotionSetup.Run: 걷기·달리기 MoveRate 파라미터와 캐릭터 컨트롤러 설정. StatusVisuals: 빙결/속박 표시.

Assets/Scripts/Audio: BGM 전환, 효과음 채널 및 차징/시전 오디오 이벤트

오디오 검증: 빌드한 앱에 --audio-verify <결과 폴더> 전달. AudioVerification.Input.cs는 버튼 유지·해제·취소·회피 입력 경로를 검증합니다. --input-only를 함께 전달하면 입력 점검 부분만 실행합니다.

Tools/Archive 및 루트 Verification은 로컬 작업 자료로 Git에서 제외합니다. 최신 검증 결과는 Docs/Verification에 있습니다.

Assets/Scripts/Adventure: AdventureProgress(의뢰·고정 조우·저장), AdventureRelics(소유·장착·일시 효과), AdventureNode(상호작용·시각 표시)
Assets/Scripts/UI/RpgUI.Adventure.cs: 의뢰 대화·보상·목표 HUD·유물 가방
Assets/Scripts/Diagnostics/AdventureVerification.cs: --adventure-verify <출력 폴더>로 세 직업 진행·저장·보상 중복·지형 이동 검증. 처치 단계 검증은 실제 사망 콜백을 사용하지만 직접 피해를 주므로 일반 플레이 소요 시간·난이도 측정은 아닙니다.
