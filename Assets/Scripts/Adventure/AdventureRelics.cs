using System;
using UnityEngine;
namespace WitchPlayground {
// Owned forever, one equipped. Temporary combat effects are deliberately not saved.
public sealed class AdventureRelics:MonoBehaviour {
 [Serializable]public class Data {public int owned;public int equipped=-1;}
 public Data State=new Data();float hasteUntil,empoweredUntil;
 public bool Empowered=>State.equipped==1&&Time.time<empoweredUntil;
 public float MoveMultiplier=>State.equipped==0&&Time.time<hasteUntil?1.2f:1;
 public bool Owns(int id)=>id>=0&&id<3&&(State.owned&(1<<id))!=0;
 public static string Name(int id)=>id==0?Loc.T("바람잎 부적","Windleaf Charm","風葉のお守り"):id==1?Loc.T("달빛 잔상","Moonlit Echo","月光の残響"):Loc.T("샘물 결정","Spring Crystal","泉の結晶");
 public static string Description(int id)=>id==0?Loc.T("적 처치 후 4초간 이동속도 +20%","Kills grant +20% movement for 4s.","撃破後4秒間、移動速度+20%。"):id==1?Loc.T("회피 후 5초 내 다음 기본공격 피해 +30%","After dodging, next basic attack within 5s deals +30% damage.","回避後5秒以内の次の通常攻撃ダメージ+30%。"):Loc.T("적 처치 시 최대 마나의 12% 회복","Kills restore 12% of maximum MP.","撃破時、最大MPの12%回復。");
 public bool Equip(int id){if(id!=-1&&!Owns(id))return false;State.equipped=id;ClearTemporary();ForestSound.Play("equip");RpgSession.Instance?.Save();return true;}
 public bool Award(int id){if(id<0||id>2||Owns(id))return false;State.owned|=1<<id;State.equipped=id;ClearTemporary();return true;}
 public void OnKill(){if(State.equipped==0)hasteUntil=Time.time+4;else if(State.equipped==2){var s=GetComponent<RpgProgress>();s.AddMana(s.MaxMana*.12f);}}
 public void OnDodge(){if(State.equipped==1)empoweredUntil=Time.time+5;}
 public HitData BasicHit(HitData hit){if(Empowered){hit.damage=Mathf.RoundToInt(hit.damage*1.3f);empoweredUntil=0;}return hit;}
 public void ClearTemporary(){hasteUntil=empoweredUntil=0;}
 public void Import(Data data){State=data??new Data();State.owned&=7;if(!Owns(State.equipped))State.equipped=-1;ClearTemporary();}
}
}
