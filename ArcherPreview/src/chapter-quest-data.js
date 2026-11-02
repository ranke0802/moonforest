export const CHAPTER_QUESTS=[
  {
    "id": "M00",
    "name": "갈림길에 내려서",
    "type": "메인",
    "giver": "교회의 의뢰서",
    "zone": "plains",
    "requires": [],
    "story": "마차 정차지에서 내려 삼거리 표지를 확인한다. / 안전한 마을 방향 길을 따라 정문에 도착한다. 늑대는 경고 범위를 벗어나 우회해도 된다.",
    "line": "마부: 마을은 서쪽, 숲은 저쪽일세. 먼저 사람부터 만나 보게.",
    "rewardText": "회복약 2 · 대평원 지도",
    "xp": 70,
    "rewards": {
      "potion": 2
    },
    "objectives": [
      {
        "key": "visit:junction",
        "count": 1,
        "label": "대평원 삼거리 확인"
      },
      {
        "key": "visit:village",
        "count": 1,
        "label": "마을 도착"
      }
    ],
    "recovery": "첫 늑대 구간 사망 시 마차 옆에서 체력·초기 회복약 복구. 전투 성공을 메인 진행 조건으로 쓰지 않는다."
  },
  {
    "id": "M01",
    "name": "사람들이 기억하는 성녀",
    "type": "메인",
    "giver": "주민 1 · 노년 여성",
    "zone": "village",
    "requires": [
      "M00"
    ],
    "story": "노년 여성의 치료받은 다리 이야기를 듣는다. / 약초사의 약통과 청년의 마지막 목격담을 확인한다. / 저널에 세 증언의 공통점과 모순을 기록한다.",
    "line": "노년 여성: 받은 건 많지. 마지막으로 뭘 해 줬느냐고 물으면… 말이 잘 안 나오는구나.",
    "rewardText": "치료 붕대 2 · 숲 경계 표시",
    "xp": 130,
    "rewards": {
      "bandage": 2
    },
    "objectives": [
      {
        "key": "talk:elder",
        "count": 1,
        "label": "노년 여성의 증언"
      },
      {
        "key": "talk:herbalist",
        "count": 1,
        "label": "약초사의 증언"
      },
      {
        "key": "talk:youth",
        "count": 1,
        "label": "청년의 증언"
      }
    ],
    "recovery": "사과·장비·친밀도 퀘스트를 하지 않아도 모든 핵심 대화 가능. NPC가 이동해도 지도에 현재 위치 표시."
  },
  {
    "id": "Q01",
    "name": "문 앞에 놓인 애플파이",
    "type": "생활",
    "giver": "주민 3 · 농부",
    "zone": "village",
    "requires": [
      "M00"
    ],
    "story": "표시된 사과나무를 약공격으로 3회 친다. / 떨어진 사과 4개를 줍는다. / 농부에게 전달하고 받은 애플파이 1개를 퀵슬롯에 등록한다. 사용은 선택.",
    "line": "농부: 한 조각은 꼭 남겨 두곤 했어. 두 사람이 나눠 먹는 걸 봤거든.",
    "rewardText": "애플파이 2 · 반려동물 먹이 2",
    "xp": 70,
    "rewards": {
      "pie": 2,
      "feed": 2
    },
    "objectives": [
      {
        "key": "apple:strike",
        "count": 3,
        "label": "사과나무 약공격"
      },
      {
        "key": "item:apple",
        "count": 4,
        "label": "떨어진 사과 수집"
      }
    ],
    "recovery": "나무는 파괴 불가·타격당 사과 2개 확정·상한 6개. 잃거나 먹어도 30초 후 해당 퀘스트용 사과 복구. NPC·동물은 공격 판정 제외."
  },
  {
    "id": "Q02",
    "name": "돌려주지 못한 약통",
    "type": "생활",
    "giver": "주민 1 → 주민 4",
    "zone": "village",
    "requires": [
      "M01"
    ],
    "story": "노년 여성에게 빈 약통을 받는다. / 약초사에게 전달해 병의 봉인과 처방 날짜를 비교한다.",
    "line": "약초사: 이건 치료약 병이야. 같은 병이라고, 안에 든 것까지 같은 건 아니지.",
    "rewardText": "양질 붕대 2 · 기본 약초 식별",
    "xp": 70,
    "rewards": {
      "bandage": 2
    },
    "objectives": [
      {
        "key": "inspect:empty-vial",
        "count": 1,
        "label": "노년 여성의 빈 약통 받기"
      },
      {
        "key": "talk:vial-compare",
        "count": 1,
        "label": "약초사에게 봉인 비교 부탁"
      }
    ],
    "recovery": "병은 퀘스트 인벤토리로 분리해 판매·폐기 불가. 제출 시 저널 이미지와 관찰 기록 보존."
  },
  {
    "id": "Q03",
    "name": "먼저 다가오지 않는 친구",
    "type": "생활",
    "giver": "주민 3 · 농부",
    "zone": "village",
    "requires": [
      "Q01"
    ],
    "story": "강아지 또는 고양이 하나를 고른다. / 먹이 → 기다리기 → 다시 접근 → 쓰다듬기 → 먹이로 친밀도 60을 달성한다. / 동행/마을 대기 명령을 한 번씩 사용한다.",
    "line": "농부: 성녀가 오던 시간만 되면 약방 문을 보더라. 아직도.",
    "rewardText": "첫 동행 해금 · 먹이 3",
    "xp": 90,
    "rewards": {
      "feed": 3
    },
    "objectives": [
      {
        "key": "pet:affinity",
        "count": 60,
        "label": "동물 친밀도"
      },
      {
        "key": "pet:follow",
        "count": 1,
        "label": "동행 명령"
      },
      {
        "key": "pet:stay",
        "count": 1,
        "label": "마을 대기 명령"
      }
    ],
    "recovery": "종 선택 변경 가능. 동물은 죽거나 유실되지 않는다. 테이밍 전투·메인 단서에 필요 없음.",
    "pendingBinding": "동물 친밀도·명령 이벤트"
  },
  {
    "id": "Q04",
    "name": "돌담 밖으로 나가기 전에",
    "type": "훈련",
    "giver": "자경단 전사",
    "zone": "village",
    "requires": [
      "M00"
    ],
    "story": "마을에서 방패 밀치기를 3회, 회피를 2회 연습한다. / 체력이 줄어들었을 때 안전한 타이밍에 회복약을 사용한다. 자경단과의 예고 공격 훈련은 추후 연결된다.",
    "line": "자경단 전사: 지키는 건 맞서 서는 일만 있는 줄 알았지.",
    "rewardText": "수리한 방패 또는 방어구 보강권 1 · 회복약 2",
    "xp": 90,
    "rewards": {
      "armor-voucher": 1,
      "potion": 2
    },
    "objectives": [
      {
        "key": "action:shieldPush",
        "count": 3,
        "label": "방패 동작 연습"
      },
      {
        "key": "action:dodge",
        "count": 2,
        "label": "회피 동작 연습"
      },
      {
        "key": "action:potion",
        "count": 1,
        "label": "회복약 사용"
      }
    ],
    "recovery": "훈련 체력 1 아래로 내려가지 않고 소모품은 훈련 종료 시 보충. 건너뛰기 가능, 보상은 재도전으로 획득."
  },
  {
    "id": "M02",
    "name": "혼자 들어간 길",
    "type": "메인",
    "giver": "주민 5 · 청년",
    "zone": "plains",
    "requires": [
      "M01"
    ],
    "story": "마을에서 대평원 삼거리로 돌아간다. / 청년이 가리킨 숲길 경계석 2곳을 조사한다. / 숲 입구의 교회 문장 붕대를 확인한다.",
    "line": "청년: 다친 것 같았어. 그때라도 누굴 불렀으면… 아니, 길은 여기야.",
    "rewardText": "안전 야영점 해금 · 회복약 2",
    "xp": 190,
    "rewards": {
      "potion": 2
    },
    "objectives": [
      {
        "key": "visit:junction",
        "count": 1,
        "label": "삼거리 확인"
      },
      {
        "key": "inspect:boundary-a",
        "count": 1,
        "label": "첫 경계석 조사"
      },
      {
        "key": "inspect:boundary-b",
        "count": 1,
        "label": "두 번째 경계석 조사"
      },
      {
        "key": "inspect:bandage",
        "count": 1,
        "label": "교회 문장 붕대 조사"
      }
    ],
    "recovery": "붕대는 미리 발견해도 자동 기록. 표지판 파손 여부와 무관하게 저널 지도에 목표 영역 표시."
  },
  {
    "id": "Q05",
    "name": "빼앗긴 쇠를 다시 벼리다",
    "type": "장비",
    "giver": "주민 2 · 대장장이",
    "zone": "edge",
    "requires": [
      "M01"
    ],
    "story": "일반 고블린의 전리품에서 재활용 가능한 철붙이 3개를 모은다. / 대장장이에게 전달하고 검·활·보호구 중 현재 장비에 맞는 보상 1개를 선택한다. / 새 장비를 착용하거나 비교 화면에서 확인한다.",
    "line": "대장장이: 이 리벳, 내가 박은 거야. 가져간 날도 장부에 남아 있어. 묻는 사람이 없었지.",
    "rewardText": "정제 장비 1개 선택 · 무료 수리 1회",
    "xp": 170,
    "rewards": {
      "equipment-voucher": 1
    },
    "objectives": [
      {
        "key": "item:goblin-iron",
        "count": 3,
        "label": "고블린 철붙이 수집"
      }
    ],
    "recovery": "일반 고블린 첫 처치 전리품은 철붙이 1개 확정. 각성/전투 초기화로 이미 얻은 수량 소실 안 됨. 상자나 희귀 드롭 불필요."
  },
  {
    "id": "M03",
    "name": "약이었던 것, 약이 아닌 것",
    "type": "메인",
    "giver": "주민 4 · 약초사",
    "zone": "bear",
    "requires": [
      "M02"
    ],
    "story": "깨끗한 그늘 샘에서 달이슬풀 3포기를 채집한다. / 메인 길의 보랏빛 침전 약병 2개를 조사한다. / 야영점에서 약초사의 비교 메모를 읽고 약효와 오염 흔적을 대조한다.",
    "line": "약초사: 병을 본 적은 있어. 그 애가 괜찮은지도, 물었어야 했는데.",
    "rewardText": "해독제 3 · 야영점 조제 해금",
    "xp": 250,
    "rewards": {
      "antidote": 3
    },
    "objectives": [
      {
        "key": "item:herb",
        "count": 3,
        "label": "달이슬풀 채집"
      },
      {
        "key": "inspect:vial-a",
        "count": 1,
        "label": "첫 침전 약병 조사"
      },
      {
        "key": "inspect:vial-b",
        "count": 1,
        "label": "두 번째 침전 약병 조사"
      },
      {
        "key": "inspect:herbal-note",
        "count": 1,
        "label": "약초사의 비교 메모 읽기"
      }
    ],
    "recovery": "약초는 최소 5개 채집 지점 보장·부족분 재생. 표본은 고정 오브젝트이며 처치 운에 의존하지 않음. 마을 재방문 없이 완료 가능."
  },
  {
    "id": "Q06",
    "name": "다시 살 수 없는 것",
    "type": "인연",
    "giver": "주민 6 · 상인",
    "zone": "goblin",
    "requires": [
      "M01"
    ],
    "story": "약탈 야영지 외곽에서 상품 꾸러미 3개를 회수한다. / 외곽 천막의 표시된 유품 보관함에서 아내의 초상화 펜던트를 찾는다. / 상인에게 펜던트와 상품을 전달한다.",
    "line": "상인: 돈은 다시 벌면 되지만… 이 얼굴은 다시 구할 수 없네. / 완료: 남의 잃어버린 걸 찾아 준 사람한테, 내 장부만 숨길 수는 없겠지.",
    "rewardText": "골드 120 · 잡화 할인 10% · II등급 상자 열쇠 1",
    "xp": 190,
    "rewards": {
      "gold": 120,
      "key-2": 1
    },
    "objectives": [
      {
        "key": "item:cargo",
        "count": 3,
        "label": "상품 꾸러미 회수"
      },
      {
        "key": "item:locket",
        "count": 1,
        "label": "초상화 펜던트 회수"
      }
    ],
    "recovery": "펜던트 100% 고정·일반 상자 드롭과 분리·판매/분해 불가. 홉고블린을 잡지 않아도 회수 가능. 상품은 재입장 때 누락 수량만 보충."
  },
  {
    "id": "Q07",
    "name": "아직 맑은 물이 흐르는 곳",
    "type": "탐험",
    "giver": "주민 4 · 약초사",
    "zone": "bear",
    "requires": [
      "M03"
    ],
    "story": "곰의 발톱 자국·뒤집힌 흙·깨끗한 샘 3곳을 조사한다. / 곰을 우회하거나 선택 전투로 길을 확보한다. / 샘의 위치를 약초사의 지도에 남긴다.",
    "line": "약초사: 그때도 길을 찾아 줄 수 있었어. 혼자 무서워한 게, 그 애에게도 도움이 된 건 아니었지.",
    "rewardText": "정제 해독 부적 · 야영점 회복량 보강",
    "xp": 170,
    "rewards": {
      "antidote-charm": 1
    },
    "objectives": [
      {
        "key": "inspect:claw",
        "count": 1,
        "label": "발톱 자국"
      },
      {
        "key": "inspect:soil",
        "count": 1,
        "label": "뒤집힌 흙"
      },
      {
        "key": "inspect:spring",
        "count": 1,
        "label": "맑은 샘 기록"
      }
    ],
    "recovery": "곰 처치는 필수 아님. 조사 완료로 보상. 곰 도전의 III상자는 별도 전투 승리 보상이라 우회 보상과 구분."
  },
  {
    "id": "Q08",
    "name": "세 목소리 위의 왕",
    "type": "도전",
    "giver": "자경단 전사",
    "zone": "goblin",
    "requires": [
      "M02"
    ],
    "story": "궁수 엄폐·전사 측후면·주술사 시전 끊기 도움말을 각 한 번 확인한다. / 홉고블린 공터에서 부하 소환 신호를 읽고 우두머리를 처치한다. / 약탈 창고의 III등급 상자를 연다.",
    "line": "자경단 전사: 지휘하는 놈부터 보면, 나머지가 언제 움직일지도 보일 거야.",
    "rewardText": "III등급 상자 1 · 회복약 2 · 야영지 지름길",
    "xp": 320,
    "rewards": {
      "potion": 2
    },
    "objectives": [
      {
        "key": "read:archer",
        "count": 1,
        "label": "궁수 전술 확인"
      },
      {
        "key": "read:warrior",
        "count": 1,
        "label": "전사 전술 확인"
      },
      {
        "key": "read:shaman",
        "count": 1,
        "label": "주술사 전술 확인"
      },
      {
        "key": "kill:hobgoblin",
        "count": 1,
        "label": "홉고블린 우두머리 처치"
      },
      {
        "key": "chest:goblin-relic",
        "count": 1,
        "label": "약탈 창고 III 상자"
      }
    ],
    "recovery": "홉고블린 실패 시 공터 밖 야영점에서 재도전. 펜던트·주요 단서 진행은 유지. 쓰러진 왕은 저장 후 재보상 없음.",
    "pendingBinding": "홉고블린 처치 이벤트"
  },
  {
    "id": "M04",
    "name": "버려진 치료 야영지",
    "type": "메인",
    "giver": "주민 5의 지도 / 현장",
    "zone": "trail",
    "requires": [
      "M03"
    ],
    "story": "두 숲길이 만나는 폐야영지에서 교회 붕대와 치료 도구를 조사한다. / 건조대의 날짜표와 새 약병의 다른 제조 흔적을 비교한다. / 물이 동굴 쪽에서 흘러온다는 것을 기록한다.",
    "line": "주인공: 처음엔 치료를 했어. 그다음에 무엇이 달라진 거지.",
    "rewardText": "동굴 방향 확정 · 야영 회복",
    "xp": 260,
    "rewards": {
      "bandage": 2
    },
    "objectives": [
      {
        "key": "inspect:camp-bandage",
        "count": 1,
        "label": "야영지 붕대"
      },
      {
        "key": "inspect:satchel",
        "count": 1,
        "label": "치료 도구"
      },
      {
        "key": "inspect:date-label",
        "count": 1,
        "label": "건조대 날짜표"
      },
      {
        "key": "inspect:water-origin",
        "count": 1,
        "label": "동굴 방향 물길 기록"
      }
    ],
    "recovery": "고블린 분기를 건너뛰어도 합류점과 단서 접근 가능. 상호작용 순서 무관, 마지막 미확인 흔적에 가벼운 표시 제공."
  },
  {
    "id": "M05",
    "name": "오염의 물길을 거슬러",
    "type": "메인",
    "giver": "현장 추적",
    "zone": "mouth",
    "requires": [
      "M04"
    ],
    "story": "보랏빛 침전이 있는 물길 3구간을 따라간다. / 박쥐·들쥐·뱀 구간을 통과한다. 처치는 선택이다. / 동굴 앞 마지막 야영점을 확보한다.",
    "line": "주인공: 흘러나오는 곳이 있어. 숲이 시작점은 아니야.",
    "rewardText": "해독제 2 · 동굴 앞 체크포인트",
    "xp": 280,
    "rewards": {
      "antidote": 2
    },
    "objectives": [
      {
        "key": "inspect:water-a",
        "count": 1,
        "label": "첫 오염 물길"
      },
      {
        "key": "inspect:water-b",
        "count": 1,
        "label": "두 번째 오염 물길"
      },
      {
        "key": "inspect:water-c",
        "count": 1,
        "label": "동굴 앞 물길"
      },
      {
        "key": "visit:cave-camp",
        "count": 1,
        "label": "동굴 앞 야영점"
      }
    ],
    "recovery": "뱀 독은 지속 피해 상한과 충분한 예고 적용. 해독제 0개면 입구 상자에서 퀘스트용 1개 보장. 반려동물 동행 없어도 흔적 식별 가능."
  },
  {
    "id": "M06",
    "name": "범위를 벗어나지 않는 문지기",
    "type": "메인",
    "giver": "현장 / 자경단의 조언",
    "zone": "mouth",
    "requires": [
      "M05"
    ],
    "story": "퇴로를 막는 좀비를 분리한다. / 문지기 구울 전사를 처치한다. / 이후 압력판 하나와 레버 하나를 조작해 문을 연다.",
    "line": "주인공: 쫓아오는 게 아니군. 여길 지키라고 명령받았어.",
    "rewardText": "II등급 고정 장비 상자 · 동굴 단축문",
    "xp": 390,
    "rewards": {
      "equipment-voucher": 1
    },
    "objectives": [
      {
        "key": "kill:ghoul",
        "count": 1,
        "label": "구울 문지기 처치"
      },
      {
        "key": "inspect:pressure",
        "count": 1,
        "label": "압력판 조작"
      },
      {
        "key": "inspect:lever",
        "count": 1,
        "label": "문 레버 조작"
      }
    ],
    "recovery": "구울 처치 플래그와 문 개방 저장. 사망 후 퍼즐 재수행 불필요. 움직이는 물체로 판을 눌러야 하는 물리 퍼즐 대신 짧은 순서 조작.",
    "pendingBinding": "구울 문지기 처치 이벤트"
  },
  {
    "id": "M07",
    "name": "돌아오지 못한 이름",
    "type": "메인",
    "giver": "실험실",
    "zone": "cave",
    "requires": [
      "M06"
    ],
    "story": "짧은 실험 기록 3개를 읽는다. 목적·피해 사실은 아직 확정하지 않는다. / 타락한 성녀 엘레나와 비탄의 성녀 엘레나의 2단계 전투를 치러 제압한다. / 전투가 끝난 뒤 보존실의 요아힘과 일지를 확인한다.",
    "line": "엘레나: 그 방에 가까이 가지 마. / 일지: 움직이는 것만으로는 돌아왔다고 할 수 없다.",
    "rewardText": "III등급 실험실 봉인상자 해제 · 장 종료 준비",
    "xp": 600,
    "rewards": {
      "key-3": 1
    },
    "objectives": [
      {
        "key": "inspect:record-a",
        "count": 1,
        "label": "첫 실험 기록"
      },
      {
        "key": "inspect:record-b",
        "count": 1,
        "label": "두 번째 실험 기록"
      },
      {
        "key": "inspect:record-c",
        "count": 1,
        "label": "세 번째 실험 기록"
      },
      {
        "key": "kill:mourning-elena",
        "count": 1,
        "label": "엘레나 2단계 제압"
      },
      {
        "key": "inspect:joachim",
        "count": 1,
        "label": "보존실과 일지 확인"
      }
    ],
    "recovery": "두 단계 연속 보스는 재시도 시 문 앞 회복. 첫 승리 후 결과·일지·상자 접근 저장. 쓰러짐은 제압이며 소멸하지 않는다."
  },
  {
    "id": "M08",
    "name": "끝나지 않은 의뢰",
    "type": "메인",
    "giver": "엘레나 / 비비앙",
    "zone": "cave",
    "requires": [
      "M07"
    ],
    "story": "엘레나와 대화하고 그녀가 비비앙과 떠나는 장면을 본다. / 실험실 배출 장치를 정지한다. / 연구 기록과 교회 인장을 챙겨 귀환길을 연다.",
    "line": "비비앙: 이 인과율에 엮이다니. 너도 참 안됐구나.",
    "rewardText": "귀환 이동 해금 · 다음 장 의뢰 단서",
    "xp": 340,
    "rewards": {
      "church-seal": 1
    },
    "objectives": [
      {
        "key": "talk:elena",
        "count": 1,
        "label": "엘레나의 증언"
      },
      {
        "key": "talk:vivian",
        "count": 1,
        "label": "비비앙의 기록"
      },
      {
        "key": "inspect:valve",
        "count": 1,
        "label": "배출 장치 정지"
      },
      {
        "key": "inspect:church-seal",
        "count": 1,
        "label": "기록과 교회 인장 회수"
      }
    ],
    "recovery": "원작 결말 유지. 비비앙을 첫 장의 추가 보스로 만들지 않는다. 정지 장치는 사라지는 엘레나 모델과 독립해 조작 가능."
  },
  {
    "id": "M09",
    "name": "이번에는 다른 질문",
    "type": "메인",
    "giver": "주민 5 · 청년",
    "zone": "village",
    "requires": [
      "M08"
    ],
    "story": "마을에 돌아와 청년에게 엘레나가 떠나기 전의 일을 묻는다. / 얻은 기록을 저널의 증언 페이지에 연결한다.",
    "line": "주인공: 이번에는 어디로 갔는지 묻는 게 아니야. 떠나기 전에, 여기서 무슨 일이 있었지?",
    "rewardText": "첫 장 완료 · 후속 조사 해금",
    "xp": 190,
    "rewards": {},
    "objectives": [
      {
        "key": "talk:youth-return",
        "count": 1,
        "label": "청년의 마지막 증언"
      },
      {
        "key": "inspect:evidence-link",
        "count": 1,
        "label": "증언과 기록 연결"
      }
    ],
    "recovery": "보조 퀘스트 미완료여도 장 종료 가능. 청년의 핵심 증언은 보상이나 친밀도와 무관하게 열린다."
  },
  {
    "id": "Q09",
    "name": "늦게라도 남기는 기록",
    "type": "후일담",
    "giver": "주민 1–6 / 자경단",
    "zone": "village",
    "requires": [
      "M09"
    ],
    "story": "원하는 순서로 6명 주민과 자경단의 추가 진술을 모은다. / 장부·미발송 편지·교대 기록을 교회 보고 봉투에 묶는다. / 마을 공동 구호함의 III등급 상자를 허락받아 연다.",
    "line": "상인: 아내의 얼굴은 돌려받았지. 그 사람에게는 돌려줄 수 없는 게 있다는 것도 알아.",
    "rewardText": "마을 III등급 상자 · 다음 장용 회복 물자",
    "xp": 240,
    "rewards": {
      "pie": 3
    },
    "objectives": [
      {
        "key": "talk:after-elder",
        "count": 1,
        "label": "elder의 추가 진술"
      },
      {
        "key": "talk:after-smith",
        "count": 1,
        "label": "smith의 추가 진술"
      },
      {
        "key": "talk:after-farmer",
        "count": 1,
        "label": "farmer의 추가 진술"
      },
      {
        "key": "talk:after-herbalist",
        "count": 1,
        "label": "herbalist의 추가 진술"
      },
      {
        "key": "talk:after-youth",
        "count": 1,
        "label": "youth의 추가 진술"
      },
      {
        "key": "talk:after-merchant",
        "count": 1,
        "label": "merchant의 추가 진술"
      },
      {
        "key": "talk:after-guard",
        "count": 1,
        "label": "guard의 추가 진술"
      },
      {
        "key": "chest:village-relief",
        "count": 1,
        "label": "공동 구호함 III 상자"
      }
    ],
    "recovery": "6개 이전 보조 퀘스트 완료 강요 없음. 수집물을 소유하지 않았다면 주민이 해당 기록 사본 제공. 어느 대사도 일괄 용서 선택지를 강요하지 않는다."
  }
];
