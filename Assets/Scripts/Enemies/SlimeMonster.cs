using UnityEngine;
namespace WitchPlayground {
[RequireComponent(typeof(CharacterController))]public sealed class SlimeMonster:MonoBehaviour {
 public Transform visual;public int maxHealth=80;public float speed=1.8f,aggroRange=7,leashRange=12,respawnDelay=10;public bool isBee,isBoss,isElite,persistentDefeat;public string QuestId="";
 public int Region;public bool PopulationManaged,Windup;public float damageMultiplier=1;
 public int Health{get;private set;}public bool IsDead=>Health<=0;public string State{get;private set;}="Idle";public bool TestIdle;public int TimesDefeated{get;private set;}
 public int XPReward=>AdventureProgress.Instance?Mathf.RoundToInt((isBoss?120:isElite?40:isBee?12:8)*(1+(AdventureProgress.Instance.State.danger-1)*.2f)):isBoss?180:isElite?80:isBee?30:20;public string DisplayName=>isElite?(isBee?Loc.T("정예 꿀날개","Elite Honeywing","精鋭の蜂"):Loc.T("정예 슬라임","Elite Slime","精鋭スライム")):isBoss?Loc.T("은빛 달늑대","Silver Moonwolf","銀月の狼"):isBee?Loc.T("꿀날개 벌","Honeywing Bee"):Loc.T("젤리 슬라임","Jelly Slime");public Vector3 HitPoint=>transform.position+Vector3.up*(isBoss?1.2f:isBee?.85f:.45f);
 public HitData LastHit{get;private set;}public Vector3 LastKnockback{get;private set;}
 WitchPlayer player;CharacterController motor;Vector3 home,visualBase,baseScale,knock;float alertedUntil;float gravity,phase,nextHit,deathAt,flashUntil,stunUntil,slowUntil,freezeUntil,rootUntil,hardStunUntil;Renderer[] renderers;MaterialPropertyBlock block;Animator wings;
 void Awake(){Health=maxHealth;home=transform.position;player=FindAnyObjectByType<WitchPlayer>();motor=GetComponent<CharacterController>();renderers=GetComponentsInChildren<Renderer>();block=new MaterialPropertyBlock();visualBase=visual.localPosition;baseScale=visual.localScale;wings=visual.GetComponentInChildren<Animator>();}
 void Start(){phase=transform.position.x;}
 public bool HardStunned=>Time.time<hardStunUntil;public bool Stunned=>Time.time<stunUntil;public bool Rooted=>Time.time<rootUntil;
 public bool Frozen=>Time.time<freezeUntil;public bool Slowed=>Time.time<slowUntil;
 void Update(){
  if(Time.timeScale==0)return;
  if(IsDead){State="Defeated";if(wings&&!isBoss)wings.speed=0;float since=Time.time-(deathAt-respawnDelay);float shrink=Mathf.Lerp(1,.01f,Mathf.Clamp01(since/1.1f));visual.localScale=baseScale*shrink;visual.localPosition=visualBase;foreach(var r in renderers)r.enabled=since<1.1f;if(!isBoss&&!persistentDefeat&&Time.time>=deathAt&&(!player||Vector3.Distance(player.transform.position,home)>4))ResetMonster();return;}if(isBoss)return;

  Vector3 toward=player?Vector3.ProjectOnPlane(player.transform.position-transform.position,Vector3.up):Vector3.zero;float distance=toward.magnitude;
  bool alerted=Time.time<alertedUntil;
  bool chasing=!TestIdle&&!Windup&&player&&!player.IsDead&&distance<(alerted?20:aggroRange)&&Vector3.ProjectOnPlane(home-player.transform.position,Vector3.up).magnitude<(alerted?24:leashRange);
  Vector3 dir=Vector3.zero;if(chasing){State="Chasing";dir=toward.normalized;if(distance<(isBee?1.05f:.85f)){dir=Vector3.zero;if(Time.time>=nextHit&&Time.time>=stunUntil&&!Frozen){ForestSound.Play(isBee?"bee_attack":"slime_attack",transform.position,.55f);bool critical=Random.value<.05f;player.TakeDamage(Mathf.RoundToInt((isElite?20:isBee?14:12)*damageMultiplier*(critical?1.5f:1)),critical,this);nextHit=Time.time+1.3f;}}}else{State="Idle";Vector3 back=Vector3.ProjectOnPlane(home-transform.position,Vector3.up);if(back.magnitude>.35f){dir=back.normalized;State="Returning";}}
  if(TestIdle||Windup||Time.time<stunUntil||Frozen||Rooted)dir=Vector3.zero;
  if(dir.sqrMagnitude>.01f){if(Physics.SphereCast(transform.position+Vector3.up*.5f,.32f,dir,out RaycastHit hit,.8f,(1<<11)|(1<<13),QueryTriggerInteraction.Ignore)){var tangent=Vector3.Cross(Vector3.up,hit.normal).normalized;if(Vector3.Dot(tangent,dir)<0)tangent=-tangent;dir=(dir*.25f+tangent).normalized;}transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(dir),Time.deltaTime*8);}
  if(motor.isGrounded&&gravity<0)gravity=-2;gravity-=20*Time.deltaTime;motor.Move((dir*speed*(Time.time<slowUntil?.45f:1)+knock+Vector3.up*gravity)*Time.deltaTime);knock=Vector3.Lerp(knock,Vector3.zero,1-Mathf.Exp(-9*Time.deltaTime));
  if(wings)wings.speed=Frozen||HardStunned?0:1;
  if(Frozen||HardStunned){/* Keep the last pose throughout immobilization. */}else if(isBee){visual.localPosition=visualBase+Vector3.up*(.35f+Mathf.Sin(Time.time*5+phase)*.07f);visual.localScale=baseScale;}else{float bounce=Mathf.Abs(Mathf.Sin(Time.time*(chasing?7:3)+phase));visual.localPosition=visualBase+Vector3.up*bounce*(Rooted?0:chasing?.15f:.04f);visual.localScale=Vector3.Scale(baseScale,new Vector3(1+(1-bounce)*.08f,1-(1-bounce)*.10f,1+(1-bounce)*.08f));}
  block.SetColor("_EmissionColor",Time.time<flashUntil?new Color(.6f,.45f,1)*1.5f:Color.black);foreach(var r in renderers)r.SetPropertyBlock(block);
 }
 public void TakeDamage(int amount,WitchPlayer attacker){ReceiveHit(new HitData{damage=amount,owner=attacker,charge=0,knockback=1.4f,direction=attacker?transform.position-attacker.transform.position:Vector3.forward});}
 public void ReceiveHit(HitData hit){if(IsDead||hit.damage<=0)return;LastHit=hit;if(hit.owner)alertedUntil=Time.time+10;int actualDamage=Mathf.Min(Health,hit.damage);Health-=actualDamage;ForestSound.Play(IsDead?(isBoss?"victory":isBee?"bee_death":"slime_death"):(isBoss?"boss_hit":isBee?"bee_hit":"slime_hit"),HitPoint,isBoss?.85f:.6f);if(hit.critical&&!IsDead)ForestSound.Play("critical",HitPoint,.55f);if(hit.owner&&hit.owner.Combat)hit.owner.Combat.OnDamageDealt(actualDamage);flashUntil=Time.time+.16f;stunUntil=Mathf.Max(stunUntil,Time.time+.1f+hit.charge*.14f);knock=Vector3.ProjectOnPlane(hit.direction,Vector3.up).normalized*hit.knockback*(isBoss?.15f:1);LastKnockback=knock;RpgVFX.DamageText(HitPoint,hit.damage,hit.critical);RpgVFX.Impact(HitPoint,hit.critical);if(IsDead){TimesDefeated++;motor.enabled=false;deathAt=Time.time+respawnDelay;State="Defeated";if(hit.owner){var rs=RpgSession.Instance;rs?.BeginMutation();try{AdventureProgress.Instance?.Relics.OnKill();if(isBoss)AdventureProgress.Instance?.BossDefeated();else AdventureProgress.Instance?.EnemyDefeated(this);var stats=hit.owner.GetComponent<RpgProgress>();if(stats)stats.GainXP(XPReward);if(!isBoss)RpgSession.Instance?.RegisterKill();else if(RpgSession.Instance){RpgSession.Instance.BossDefeated=true;RpgSession.Instance.Save();}}finally{rs?.EndMutation();}}}}
 public void RootFor(float duration){rootUntil=Mathf.Max(rootUntil,Time.time+duration);if(!GetComponent<StatusVisuals>())gameObject.AddComponent<StatusVisuals>();}
 public void StunFor(float duration){hardStunUntil=Mathf.Max(hardStunUntil,Time.time+duration);stunUntil=Mathf.Max(stunUntil,hardStunUntil);if(duration>0&&!IsDead&&!GetComponent<StunStars>())gameObject.AddComponent<StunStars>();}
 public void FreezeFor(float duration){if(!Frozen&&!IsDead)ForestSound.Play("freeze",HitPoint,.55f);freezeUntil=Mathf.Max(freezeUntil,Time.time+duration);if(!GetComponent<StatusVisuals>())gameObject.AddComponent<StatusVisuals>();}
 public void SlowFor(float duration){slowUntil=Time.time+duration;}
 public void SetHome(Vector3 position){home=position;}
 public void ResetMonster(){motor.enabled=false;transform.position=home;motor.enabled=true;Health=maxHealth;Windup=false;gravity=0;knock=Vector3.zero;alertedUntil=0;nextHit=Time.time+.5f;stunUntil=slowUntil=freezeUntil=rootUntil=hardStunUntil=0;foreach(var r in renderers)r.enabled=true;State="Idle";if(visual){visual.localScale=baseScale;visual.localPosition=visualBase;}if(wings)wings.speed=1;}
}
public static class CombatHit {
 public static Component Target(Collider c){var slime=c.GetComponentInParent<SlimeMonster>();return slime?(Component)slime:c.GetComponentInParent<PracticeDummy>();}
 public static void Apply(Component target,int damage,WitchPlayer owner){if(target is SlimeMonster s)s.TakeDamage(damage,owner);else if(target is PracticeDummy d)d.TakeHit(damage);}
}
}
