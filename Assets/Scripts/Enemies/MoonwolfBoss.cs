using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed class MoonwolfBoss:MonoBehaviour {
 public enum Skill{Charge,Storm,Howl}public Skill LastSkill;public bool Casting;public string ActionName;public int SkillsUsed;WitchPlayer player;SlimeMonster health;CharacterController motor;Animator animator;float nextSkill=4,nextBite,gravity;int cycle;readonly List<RasterEffect> marks=new List<RasterEffect>();
 void Start(){player=RpgProgress.Instance.player;health=GetComponent<SlimeMonster>();motor=GetComponent<CharacterController>();animator=GetComponentInChildren<Animator>();nextSkill=Time.time+3;}
 void Update(){if(Time.timeScale==0||health.TestIdle)return;if(animator)animator.speed=health.IsDead?1:health.Frozen||health.HardStunned?0:1;if(health.IsDead){Play("Death");return;}if(!player||player.IsDead||health.HardStunned||health.Frozen)return;Vector3 toward=Vector3.ProjectOnPlane(player.transform.position-transform.position,Vector3.up);float distance=toward.magnitude;if(!Casting){if(distance<16&&Time.time>=nextSkill){Cast((Skill)(cycle++%3));return;}if(distance>1.8f&&distance<20&&!health.Rooted){transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(toward),Time.deltaTime*4);motor.Move(toward.normalized*2.1f*Time.deltaTime);Play("Walk");}else{Play("Idle");if(distance<2.1f&&Time.time>=nextBite){Play("Attack",true);ForestSound.Play("wolf_bite",transform.position,.75f);player.TakeDamage(Mathf.RoundToInt(24*health.damageMultiplier),false,health);nextBite=Time.time+1.5f;}}}if(motor.enabled){if(motor.isGrounded)gravity=-2;gravity-=20*Time.deltaTime;motor.Move(Vector3.up*gravity*Time.deltaTime);}}
 public void Cast(Skill skill){if(Casting||health.IsDead)return;StartCoroutine(Perform(skill));}
 RasterEffect Mark(Vector3 p,float radius,Color color){if(Physics.Raycast(p+Vector3.up*60,Vector3.down,out RaycastHit h,120,1<<10))p=h.point;var fx=ElementalSpells.Sprite(p+Vector3.up*.14f,0,radius*2,.65f,true);fx.loop=true;fx.tint=color;return fx;}
 IEnumerator Perform(Skill skill){ForestSound.Play("boss_warning",transform.position,.9f);Casting=true;LastSkill=skill;ActionName=skill==Skill.Charge?Loc.T("맹렬한 돌진","Furious Charge","猛烈な突進"):skill==Skill.Storm?Loc.T("서리 폭풍","Frost Storm","氷の嵐"):Loc.T("달의 하울링","Moon Howl","月の遠吠え");Play(skill==Skill.Howl?"Howl":"Cast",true);Vector3 target=player.transform.position,origin=transform.position;Vector3 direction=Vector3.ProjectOnPlane(target-origin,Vector3.up).normalized;if(direction.sqrMagnitude<.1f)direction=transform.forward;transform.rotation=Quaternion.LookRotation(direction);ClearMarks();float windup=skill==Skill.Charge?1.25f:skill==Skill.Storm?2:1.8f;
  if(skill==Skill.Charge)for(int i=1;i<=6;i++)marks.Add(Mark(origin+direction*i*1.2f,.85f,new Color(1,.25f,.15f)));else marks.Add(Mark(skill==Skill.Storm?target:origin,skill==Skill.Storm?4:6,skill==Skill.Storm?new Color(.3f,.8f,1):new Color(.8f,.3f,1)));
  float t=0;while(t<windup){if(health.IsDead||health.HardStunned){foreach(var m in marks)if(m)Destroy(m.gameObject);Casting=false;yield break;}t+=Time.deltaTime;yield return null;}
  foreach(var m in marks)if(m)Destroy(m.gameObject);SkillsUsed++;
  if(skill==Skill.Charge){ForestSound.Play("wolf_charge",transform.position,.9f);Play("Charge",true);bool hit=false;for(float elapsed=0;elapsed<.65f;elapsed+=Time.deltaTime){if(health.IsDead||health.HardStunned||health.Rooted)break;motor.Move(direction*11*Time.deltaTime);if(!hit&&Vector3.ProjectOnPlane(player.transform.position-transform.position,Vector3.up).magnitude<1.65f){player.TakeDamage(Mathf.RoundToInt(38*health.damageMultiplier),false,health);player.Knockback(direction*6);hit=true;}yield return null;}}
  else if(skill==Skill.Storm){for(int i=0;i<3;i++){if(health.IsDead||health.HardStunned)break;ForestSound.Play("frost_storm",target,.75f);RpgVFX.Sprite(target+Vector3.up*.2f,1,8,.7f,true);for(int n=0;n<8;n++)ElementalSpells.Sprite(target+Quaternion.Euler(0,n*45,0)*Vector3.forward*2+Vector3.up,3,1,.6f);if(Vector3.ProjectOnPlane(player.transform.position-target,Vector3.up).magnitude<4)player.TakeDamage(Mathf.RoundToInt(18*health.damageMultiplier),false,health);yield return new WaitForSeconds(.7f);}}
  else{ForestSound.Play("wolf_howl",origin,.9f);RpgVFX.Sprite(origin+Vector3.up*.4f,1,12,1,true);if(Vector3.Distance(player.transform.position,origin)<6){RpgProgress.Instance.WeakenedUntil=Time.time+8;RpgUI.Toast(Loc.T("하울링 · 8초간 공격력 30% 감소","Howl · Attack -30% for 8s","遠吠え · 8秒間攻撃力30%低下"));}}
  Casting=false;ActionName="";nextSkill=Time.time+4;Play("Idle",true);
 }
 public IEnumerable<RasterEffect> Warnings=>marks;
 void ClearMarks(){foreach(var m in marks)if(m)Destroy(m.gameObject);marks.Clear();}
 public void ResetEncounter(){StopAllCoroutines();ClearMarks();Casting=false;ActionName="";cycle=0;gravity=0;nextBite=Time.time+1;nextSkill=Time.time+3;state="";}
 void OnDisable(){ResetEncounter();}
 string state;void Play(string name,bool force=false){if(!animator||(!force&&state==name))return;state=name;animator.CrossFadeInFixedTime(name,.14f);}
}
}
