using UnityEngine;
namespace WitchPlayground {
public static class ClassSkills {
 public static string Name(int hero,SpellId id){int i=(int)id;if(hero==1)return new[]{Loc.T("삼연 검격","Threefold Slash","三連剣撃"),Loc.T("잔영 베기","Afterimage Cut","残影斬り"),Loc.T("버티컬 슬래시","Vertical Slash","ヴァーティカルスラッシュ"),Loc.T("철벽 패링","Iron Parry","鉄壁パリィ")}[i];return new[]{Loc.T("정밀 사격","Aimed Shot","精密射撃"),Loc.T("트리플샷","Triple Shot","トリプルショット"),Loc.T("사냥꾼의 덫","Hunter's Snare","狩人の罠"),Loc.T("화살비","Arrow Rain","矢の雨")}[i];}
 public static float Cooldown(int hero,SpellId id)=>id==SpellId.Energy?0:hero==1?(id==SpellId.Frost?5:id==SpellId.Meteor?7:9):(id==SpellId.Frost?5:id==SpellId.Meteor?10:14);
 public static int Cost(int hero,SpellId id)=>id==SpellId.Energy?2:id==SpellId.Frost?10:id==SpellId.Meteor?14:20;
 public static string Description(int hero,SpellId id){int i=(int)id;if(hero==1)return new[]{Loc.T("전진 3연타 · 마지막 치명타 · 피해 10% 회복","Advancing 3-hit combo · Critical finisher · 10% lifesteal","前進3連撃 · 最後は会心 · ダメージ10%回復"),Loc.T("가까운 적에게 돌진 · 기본피해 50%","Dash to nearest · 50% basic damage","最寄りの敵へ突進 · 通常の50%"),Loc.T("전방 부채꼴 · 기본피해 180%","Frontal cone · 180% basic damage","前方扇形 · 通常の180%"),Loc.T("1.5초 패링 · 공격자 2초 기절","1.5s parry · Stun attacker for 2s","1.5秒パリィ · 攻撃者を2秒気絶")}[i];return new[]{Loc.T("0.6초 조준 · 좌클릭 놓아 발사 / J 연사","0.6s draw · Release mouse / Hold J to repeat","0.6秒照準 · マウスを離して発射 / J連射"),Loc.T("0.3초 준비 · 0.2초 간격 · 100/90/80%","0.3s draw · 0.2s gaps · 100/90/80%","0.3秒準備 · 0.2秒間隔 · 100/90/80%"),Loc.T("40초 유지 · 3초 속박 · 재사용 10초","Lasts 40s · Root 3s · Cooldown 10s","40秒持続 · 3秒拘束 · 再使用10秒"),Loc.T("2초 준비 · 3초간 0.5초마다 피해 80%","2s draw · 80% each 0.5s for 3s","2秒準備 · 3秒間0.5秒毎に80%")}[i];}
}
}
