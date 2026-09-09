using System;
using UnityEngine;
namespace WitchPlayground {
public enum SpellId {Energy,Frost,Meteor,Heal}
[Serializable]public struct HitData {public int damage;public bool critical;public float charge,knockback;public Vector3 direction;public WitchPlayer owner;}
[Serializable]public class LevelOffer {public int category;public SpellId spell;public bool speed;}
[DefaultExecutionOrder(-80)]public sealed class RpgProgress:MonoBehaviour {
 public static RpgProgress Instance;public WitchPlayer player;public Transform tomeVisual;
 public int Level{get;private set;}=1;public int XP{get;private set;}public int NeededXP=>40+(Level-1)*20;
 public int PendingChoices{get;private set;}public LevelOffer[] Offers{get;private set;}
 public int[] ranks={1,0,0,0};public int attackTraining,hasteTraining,vitalityTraining;public bool Equipped{get;private set;}=true;
 public float Mana{get;private set;}=80;public int MaxMana=>80+(Level-1)*8+vitalityTraining*10;
 public float baseChargeSeconds=1.4f;public float damageTuning=1,manaRegenTuning=1;public float ManaRegen=>manaRegenTuning*(6+(Level-1)*.35f);public float AttackMultiplier=>damageTuning*(1+(Level-1)*.04f)*DamageDebuff;public float BasicMultiplier=>AttackMultiplier*(1+attackTraining*.12f);
 public float CastSpeed=>1+hasteTraining*.10f;public float CritChance=>Mathf.Min(.30f,.10f+(Level-1)*.005f);
 public int CritOverride=-1;public bool TestSession;readonly float[] ready=new float[4];
 public bool Blocked=>RpgUI.Blocking;public SpellId SelectedSkill=SpellId.Frost;public float WeakenedUntil;public float DamageDebuff=>Time.time<WeakenedUntil?.7f:1;
 void Awake(){Instance=this;player=GetComponent<WitchPlayer>();var args=Environment.GetCommandLineArgs();TestSession=Array.IndexOf(args,"--audio-verify")>=0||Array.IndexOf(args,"--music-verify")>=0||Array.IndexOf(args,"--sword-trail-verify")>=0||Array.IndexOf(args,"--ux-verify")>=0||Array.IndexOf(args,"--v47-verify")>=0||Array.IndexOf(args,"--v46-verify")>=0||Array.IndexOf(args,"--v45-verify")>=0||Array.IndexOf(args,"--v44-verify")>=0||Array.IndexOf(args,"--rpg-verify")>=0||Array.IndexOf(args,"--v4-verify")>=0||Array.IndexOf(args,"--v43-verify")>=0||Array.IndexOf(args,"--v42-verify")>=0||Array.IndexOf(args,"--v41-verify")>=0||Array.IndexOf(args,"--v4-ui-test")>=0; Mana=MaxMana;}
 void Start(){ApplyStats(true);ApplyEquipmentVisual();}
 void Update(){if(player&&!player.TestControl)player.PollChannelInput();if(!player||player.IsDead||Time.timeScale==0)return;Mana=Mathf.Min(MaxMana,Mana+ManaRegen*Time.deltaTime);if(!player.TestControl&&!Blocked){if(Input.GetKeyDown(KeyCode.Q))TrySkill(SpellId.Frost);if(Input.GetKeyDown(KeyCode.F))TrySkill(SpellId.Meteor);if(Input.GetKeyDown(KeyCode.V))TrySkill(SpellId.Heal);if(Input.GetKeyDown(KeyCode.Tab))SelectLeft();if(ShouldCastSelected(Input.GetMouseButtonDown(1),PlaygroundView.ShiftHeld,RpgUI.PointerOverHUD))TrySkill(SelectedSkill,player.AimPoint());}}
 public static bool ShouldCastSelected(bool rightDown,bool shift,bool overHUD)=>rightDown&&!shift&&!overHUD;
 public void SelectLeft(){ForestSound.Play("ui_select");for(int n=0;n<3;n++){int i=(int)SelectedSkill-1;if(i<1)i=3;SelectedSkill=(SpellId)i;if(Learned(SelectedSkill))break;}}
 public void ApplyEquipmentVisual(){if(tomeVisual)tomeVisual.gameObject.SetActive(Equipped&&(!GetComponent<HeroRoster>()||GetComponent<HeroRoster>().Selected==0));}

 public string SpellName(SpellId id){if(player&&player.Combat&&player.Combat.ClassId>0)return ClassSkills.Name(player.Combat.ClassId,id);switch(id){case SpellId.Energy:var hero=GetComponent<HeroRoster>();return hero&&hero.Selected==1?Loc.T("검격","Sword Slash","剣撃"):hero&&hero.Selected==2?Loc.T("푸른 화살","Azure Arrow","蒼い矢"):Loc.T("에너지 볼","Energy Ball");case SpellId.Frost:return Loc.T("서리 파동","Frost Nova");case SpellId.Meteor:return Loc.T("유성 낙하","Starfall");default:return Loc.T("초록빛 회복","Verdant Mend");}}
 public int Rank(SpellId id)=>ranks[(int)id];public bool Learned(SpellId id)=>Rank(id)>0;
 public float Cooldown(SpellId id)=>Mathf.Max(0,ready[(int)id]-Time.time);
 public float SkillCooldown(SpellId id)=>player&&player.Combat&&player.Combat.ClassId>0?ClassSkills.Cooldown(player.Combat.ClassId,id):Mathf.Max(2,(id==SpellId.Frost?5.5f:id==SpellId.Meteor?8:12)-(Rank(id)-1)*.45f);
 public int Cost(SpellId id)=>player&&player.Combat&&player.Combat.ClassId>0?ClassSkills.Cost(player.Combat.ClassId,id):id==SpellId.Frost?16:id==SpellId.Meteor?25:id==SpellId.Heal?20:2;
 public bool CanUseWeapon(bool tell=true){if(Equipped)return true;if(tell)ForestSound.Play("ui_error");if(tell)RpgUI.Toast(Loc.T("가방에서 무기를 장착하세요.","Equip your weapon in the bag.","バッグから武器を装備してください。"));return false;}
 public bool Spend(float cost){if(Mana+.001f<cost){ForestSound.Play("ui_error");RpgUI.Toast(Loc.T("마나가 부족합니다.","Not enough mana."));return false;}Mana=Mathf.Max(0,Mana-cost);return true;}
 public void RestoreMana(){Mana=MaxMana;}public void SetManaForTest(float value){Mana=Mathf.Clamp(value,0,MaxMana);}
 public void SetEquipped(bool value){if(value!=Equipped)ForestSound.Play("equip");Equipped=value;if(!value){player.ClearBufferedInput();player.CancelChannel();}player.CancelCharge();ApplyEquipmentVisual();Save();}
 public HitData MakeHit(float baseDamage,float charge,Vector3 direction){bool crit=CritOverride==1||(CritOverride<0&&UnityEngine.Random.value<CritChance);return new HitData{damage=Mathf.RoundToInt(baseDamage*AttackMultiplier*(crit?1.75f:1)),critical=crit,charge=charge,knockback=Mathf.Lerp(1.4f,5.4f,Mathf.Clamp01(charge)),direction=direction.normalized,owner=player};}
 public HitData EnergyHit(float charge,Vector3 direction)=>MakeHit(Mathf.Lerp(14,64,Mathf.Pow(charge,1.2f))*(1+(Rank(SpellId.Energy)-1)*.15f)*(1+attackTraining*.12f),charge,direction);
 public bool TrySkill(SpellId id)=>TrySkill(id,null);
 public bool TrySkill(SpellId id,Vector3? at){
  if(id!=SpellId.Energy&&player.BufferSkill(id,at))return true;
  if(id!=SpellId.Energy&&player.Combat&&player.Combat.ClassId>0)return player.Combat.Skill(id,at);
  if(id==SpellId.Energy||player.IsDead||Blocked||player.IsSpellCasting||!CanUseWeapon())return false;
  if(!Learned(id)){ForestSound.Play("ui_error");RpgUI.Toast(Loc.T("레벨업 선택으로 배우는 스킬입니다.","Learn this skill when you level up."));return false;}
  if(id==SpellId.Meteor?!PrepareSkill(id):!CommitSkill(id))return false;player.CancelCharge();int rank=Rank(id);
  if(id==SpellId.Frost){player.BeginSpell(.8f,false,true);ElementalSpells.Ice(player,MakeHit((32+(rank-1)*10)/3f,.2f,player.transform.forward));}
  else if(id==SpellId.Meteor){Vector3 target=at??NearestTarget();Vector3 flat=Vector3.ProjectOnPlane(target-player.transform.position,Vector3.up);if(flat.magnitude>14)target=player.transform.position+flat.normalized*14;if(Physics.Raycast(target+Vector3.up*50,Vector3.down,out RaycastHit h,100,1<<10))target=h.point;player.BeginSpell(3,true);player.StartChannel(SpellId.Meteor,3);ElementalSpells.Meteor(player,target,MakeHit(180+(rank-1)*35,1,Vector3.up),3.1f+(rank-1)*.15f);}
  else {player.BeginSpell(.65f,false);ElementalSpells.HealOverTime(player);}
  return true;
 }
 bool prepared;SpellId preparedSpell;
 public bool CheckReady(SpellId id){if(Cooldown(id)<=0)return true;ForestSound.Play("ui_error");RpgUI.Toast(SpellName(id)+Loc.T(" · 재사용 "," · Ready in "," · 再使用まで ")+Cooldown(id).ToString("0.0")+"s");return false;}
 public bool PrepareSkill(SpellId id){if(!CheckReady(id))return false;if(Mana<Cost(id)){ForestSound.Play("ui_error");RpgUI.Toast(Loc.T("마나가 부족합니다.","Not enough mana.","マナが足りません。"));return false;}prepared=true;preparedSpell=id;SelectedSkill=id;return true;}
 public bool CompletePreparedSkill(SpellId id){if(!prepared||preparedSpell!=id)return false;prepared=false;return CommitSkill(id);}
 public void CancelPreparedSkill(){prepared=false;}
 public bool CommitSkill(SpellId id){if(!CheckReady(id)||!Spend(Cost(id)))return false;SelectedSkill=id;ready[(int)id]=Time.time+SkillCooldown(id);return true;}
 Vector3 NearestTarget(){SlimeMonster best=null;float distance=14;foreach(var e in FindObjectsByType<SlimeMonster>()){float d=Vector3.Distance(e.transform.position,player.transform.position);if(!e.IsDead&&d<distance){best=e;distance=d;}}return best?best.transform.position:player.transform.position+player.transform.forward*7;}

 public void GainXP(int amount){if(amount<=0)return;int before=Level;XP+=amount;RpgUI.Toast("+"+amount+" "+Loc.T("경험치","XP"));while(XP>=NeededXP){XP-=NeededXP;Level++;PendingChoices++;ApplyStats(true);}if(Level>before)ForestSound.Play("level_up");if(PendingChoices>0&&Offers==null)BuildOffers();Save();}
 void BuildOffers(){SpellId next=SpellId.Energy;for(int i=1;i<4;i++)if(ranks[i]==0){next=(SpellId)i;break;}SpellId upgrade=SpellId.Energy;for(int i=1;i<4;i++)if(ranks[i]>0&&ranks[i]<5){upgrade=(SpellId)i;break;}Offers=new[]{new LevelOffer{category=next==SpellId.Energy?3:0,spell=next},new LevelOffer{category=1,spell=upgrade},new LevelOffer{category=2,speed=Level%2==1}};}
 public string OfferTitle(LevelOffer offer)=>offer.category==0?Loc.T("새 스킬 · ","New skill · ")+SpellName(offer.spell):offer.category==1?Loc.T("스킬 강화 · ","Upgrade · ")+SpellName(offer.spell):offer.category==2?(offer.speed?Loc.T("기본 공격 · 시전 가속","Basic attack · Haste"):Loc.T("기본 공격 · 위력 강화","Basic attack · Power")):Loc.T("마력의 그릇","Arcane Vitality");
 public string OfferDescription(LevelOffer offer)=>offer.category==0?Loc.T("새로운 마법을 배우고 단축키로 사용할 수 있습니다.","Learn a new spell and cast it with its hotkey."):offer.category==1?(offer.spell==SpellId.Heal?Loc.T("회복량은 유지하며 재사용 대기시간이 감소합니다.","Reduce cooldown while keeping the same healing.","回復量はそのままで再使用時間を短縮。"):Loc.T("위력이 증가하고 재사용 대기시간이 감소합니다.","Increase damage and reduce cooldown.","威力を上げ、再使用時間を短縮。")):offer.category==2?(offer.speed?Loc.T("충전과 기본 공격 시전 속도 +10%","+10% charge and basic casting speed"):Loc.T("기본 공격 피해 +12%","+12% basic attack damage")):Loc.T("최대 체력 +15, 최대 마나 +10","+15 maximum HP, +10 maximum MP");
 public bool Choose(int index){if(PendingChoices<=0||Offers==null||index<0||index>2)return false;ForestSound.Play("upgrade");var o=Offers[index];if(o.category==0){ranks[(int)o.spell]=1;SelectedSkill=o.spell;}else if(o.category==1){if(ranks[(int)o.spell]<5)ranks[(int)o.spell]++;else attackTraining++;}else if(o.category==2){if(o.speed)hasteTraining++;else attackTraining++;}else vitalityTraining++;PendingChoices--;Offers=null;if(PendingChoices>0)BuildOffers();ApplyStats(true);Save();return true;}
 void ApplyStats(bool refill){if(player){player.SetMaxHealth(100+(Level-1)*12+vitalityTraining*15,refill&&!player.IsDead);player.fullChargeSeconds=player.Combat&&player.Combat.ClassId==2?.6f:baseChargeSeconds/CastSpeed;}if(refill)Mana=MaxMana;}
 [Serializable]class Data {public int level,xp,attack,haste,vitality,pending,selected;public int[] ranks;public bool equipped;}
 public string Export()=>JsonUtility.ToJson(new Data{level=Level,xp=XP,attack=attackTraining,haste=hasteTraining,vitality=vitalityTraining,pending=PendingChoices,ranks=ranks,equipped=Equipped,selected=(int)SelectedSkill});
 public void Save(){if(RpgSession.Instance)RpgSession.Instance.Save();}
 public void Import(string json){if(string.IsNullOrEmpty(json))return;var d=JsonUtility.FromJson<Data>(json);if(d.ranks==null||d.ranks.Length!=4)throw new Exception("Invalid save");Level=Mathf.Max(1,d.level);XP=Mathf.Max(0,d.xp);ranks=d.ranks;ranks[0]=Mathf.Max(1,ranks[0]);attackTraining=d.attack;hasteTraining=d.haste;vitalityTraining=d.vitality;Equipped=d.equipped;PendingChoices=d.pending;SelectedSkill=(SpellId)Mathf.Clamp(d.selected,1,3);Offers=null;if(PendingChoices>0)BuildOffers();ApplyStats(true);ApplyEquipmentVisual();}
 public void ResetProgress(){CancelPreparedSkill();Level=1;XP=PendingChoices=attackTraining=hasteTraining=vitalityTraining=0;ranks=new[]{1,0,0,0};Offers=null;Equipped=true;SelectedSkill=SpellId.Frost;Array.Clear(ready,0,ready.Length);ApplyStats(true);ApplyEquipmentVisual();}
 public void RefreshStats(){ApplyStats(true);ApplyEquipmentVisual();}
}
}
