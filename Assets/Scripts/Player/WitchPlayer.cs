using UnityEngine;
namespace WitchPlayground {
[RequireComponent(typeof(CharacterController))]
public sealed class WitchPlayer:MonoBehaviour {
 public Animator animator; public Camera viewCamera;
 public float walkStrideSpeed=1.15f,runStrideSpeed=2.5f;public float walkSpeed=2.4f,runSpeed=4.8f,jumpHeight=1.15f,fullChargeSeconds=1.6f;
 public int maxHealth=100; public int Health{get;private set;}=100;
 float arrivalUntil;public bool ArrivalProtected=>Time.time<arrivalUntil;public void ProtectArrival(){arrivalUntil=Time.time+2;}public bool IsDead=>Health<=0;public bool IsSpellCasting=>Time.time<spellUntil;public ClassCombat Combat{get;private set;}public bool KnockbackImmune=>Time.time<guardUntil||(Combat&&(Combat.Evading||Combat.Defending));public bool MobileSpell=>IsSpellCasting&&spellAllowsMovement;bool spellAllowsMovement;float spellUntil,guardUntil;Vector3 impactVelocity;float movedSpeed; public string State{get;private set;}="Idle";public string ActionName{get;private set;}="";
 public int ShotsFired{get;private set;} public bool IsCharging{get;private set;}
 public float Charge01=>IsCharging?Mathf.Clamp01((Time.time-chargeStarted)/fullChargeSeconds):0;
 public int LastDamage{get;private set;} public Vector3 LastShotDirection{get;private set;} public bool ChargeUsesMouse{get;private set;} public bool Grounded=>motor&&motor.isGrounded;
 public bool TestControl{get;set;} public Vector2 TestMovement{get;set;} public bool TestRunning{get;set;}
 public Vector3 Spawn=>startPosition;
 RpgProgress stats;CharacterController motor; float chargeStarted,nextCast,hitUntil,busyUntil,verticalSpeed,lastGround=-10,jumpQueued=-10;
 public bool IsChanneling{get;private set;}public SpellId ChannelSpell{get;private set;}public int ChannelToken{get;private set;}
 float channelStarted,channelDuration;int channelStartFrame;
 public float Channel01=>IsChanneling?Mathf.Clamp01((Time.time-channelStarted)/channelDuration):0;
 public float ChannelRemaining=>IsChanneling?Mathf.Max(0,channelDuration-(Time.time-channelStarted)):0;
 public void StartChannel(SpellId spell,float duration){ChannelToken++;ChannelSpell=spell;channelDuration=duration;channelStarted=Time.time;channelStartFrame=Time.frameCount;IsChanneling=true;ForestSound.Instance?.ChannelStarted(this);}
 public bool ValidChannel(int token)=>IsChanneling&&token==ChannelToken&&!IsDead;
 public bool CompleteChannel(int token){if(!ValidChannel(token))return false;if(!stats.CompletePreparedSkill(ChannelSpell)){CancelChannel();return false;}IsChanneling=false;ForestSound.Instance?.ChannelStopped(false);spellUntil=busyUntil=guardUntil=0;return true;}
 public void CancelChannel(){if(!IsChanneling)return;ForestSound.Instance?.ChannelStopped(true);ForestSound.Play("ui_back",transform.position,.35f);IsChanneling=false;ChannelToken++;stats.CancelPreparedSkill();Combat.Interrupt();spellUntil=busyUntil=guardUntil=0;spellAllowsMovement=false;CancelCharge();held=false;int layer=animator?animator.GetLayerIndex("MobileCast"):-1;if(layer>=0)animator.SetLayerWeight(layer,0);if(!IsDead)ChangeState("Idle",true);}
 public void HandleChannelInput(Vector2 movement,bool action){if(IsChanneling&&Time.frameCount>channelStartFrame&&(movement.sqrMagnitude>.01f||action))CancelChannel();}
 public void PollChannelInput(){if(!IsChanneling)return;bool action=!RpgUI.PointerOverHUD&&(Input.GetMouseButtonDown(0)||Input.GetMouseButtonDown(1)&&!PlaygroundView.ShiftHeld);foreach(var key in new[]{KeyCode.J,KeyCode.U,KeyCode.I,KeyCode.K,KeyCode.Space})action|=Input.GetKeyDown(key);HandleChannelInput(MovementInput(),action);}
 int bufferedKind;SpellId bufferedSkill;Vector3? bufferedPoint;bool bufferedMouse;float bufferedUntil;
 public bool HasBufferedAction=>bufferedKind!=0;
 public void ClearBufferedInput(){bufferedKind=0;bufferedPoint=null;}
 bool BufferWindow=>IsSpellCasting&&!IsChanneling&&spellUntil-Time.time<=.18f;
 public bool BufferSkill(SpellId skill,Vector3? point){if(!BufferWindow||IsDead||RpgUI.Blocking||RpgUI.SuppressCombatInput||!stats.Equipped||!stats.Learned(skill)||stats.Cooldown(skill)>0||stats.Mana<stats.Cost(skill))return false;bufferedKind=2;bufferedSkill=skill;bufferedPoint=point;bufferedUntil=Time.time+.23f;return true;}
 void ConsumeBufferedInput(){if(bufferedKind==0)return;if(Time.time>bufferedUntil||IsDead||RpgUI.Blocking||RpgUI.SuppressCombatInput||!stats.Equipped){ClearBufferedInput();return;}if(IsSpellCasting||Combat.Evading||Combat.Defending)return;int kind=bufferedKind;var point=bufferedPoint;var skill=bufferedSkill;bool mouse=bufferedMouse;ClearBufferedInput();if(kind==1)Combat.SwordAttack(point??transform.position+transform.forward*2,mouse);else stats.TrySkill(skill,point);}
 float nextHeldRetry;bool held; Vector3 aim,startPosition; Quaternion startRotation; ChargeVisual chargeVisual;
 void Awake(){Combat=GetComponent<ClassCombat>();if(!Combat)Combat=gameObject.AddComponent<ClassCombat>();if(!GetComponent<AimAssist>())gameObject.AddComponent<AimAssist>();if(!GetComponent<BowNock>())gameObject.AddComponent<BowNock>();stats=GetComponent<RpgProgress>();motor=GetComponent<CharacterController>();motor.minMoveDistance=0;startPosition=transform.position;startRotation=transform.rotation;Health=maxHealth;if(!viewCamera)viewCamera=Camera.main;}
 void Start(){ChangeState("Idle",true);}
 void Update(){
  if(Time.timeScale==0||RpgUI.Blocking)return;if(!TestControl)PollChannelInput();else HandleChannelInput(TestMovement,false);
  if(!TestControl){
   if(DeveloperPanel.Instance&&DeveloperPanel.Instance.Visible&&!DeveloperPanel.InputCaptured&&Input.GetKeyDown(KeyCode.R))Respawn();
   if(DeveloperPanel.Instance&&DeveloperPanel.Instance.Visible&&!DeveloperPanel.InputCaptured&&Input.GetKeyDown(KeyCode.H))TakeDamage(25);
   ProcessButtons(Input.GetKey(KeyCode.J)&&!RpgUI.SuppressCombatInput,(Input.GetMouseButton(0)&&(!RpgUI.PointerOverHUD||IsCharging)),Input.GetKeyDown(KeyCode.Space)&&MovementInput().sqrMagnitude<.01f,AimPoint());
  }
  if(IsDead)return;ConsumeBufferedInput();
  if(!TestControl&&Input.GetKeyDown(KeyCode.Space)&&MovementInput().sqrMagnitude>.01f)Combat.TryEvade(MovementInput());
  if(IsCharging&&Combat.ClassId==2&&!ChargeUsesMouse&&Charge01>=1)ReleaseCharge(aim);
  int castLayer=animator?animator.GetLayerIndex("MobileCast"):-1;if(castLayer>=0)animator.SetLayerWeight(castLayer,(MobileSpell||(IsCharging&&Combat.ClassId==2))?1:0);
  if(transform.position.y< -12){Respawn();return;}
  Vector2 input=TestControl?TestMovement:MovementInput();
  bool running=TestControl?TestRunning:Input.GetKey(KeyCode.LeftShift)||Input.GetKey(KeyCode.RightShift);
  Vector3 forward=Vector3.ProjectOnPlane(viewCamera.transform.forward,Vector3.up).normalized,right=Vector3.ProjectOnPlane(viewCamera.transform.right,Vector3.up).normalized;
  Vector3 dir=Vector3.ClampMagnitude(forward*input.y+right*input.x,1);
  if(Combat.MovementOverride||Combat.Defending)dir=Vector3.zero;
  if((Time.time<hitUntil&&!KnockbackImmune)||(IsSpellCasting&&!MobileSpell))dir=Vector3.zero;
  if(IsCharging&&ChargeUsesMouse){Vector3 face=Vector3.ProjectOnPlane(aim-transform.position,Vector3.up);if(face.sqrMagnitude>.01f)transform.rotation=Quaternion.LookRotation(face);}
  else if(dir.sqrMagnitude>.01f&&(Time.time>busyUntil||MobileSpell))transform.rotation=Quaternion.RotateTowards(transform.rotation,Quaternion.LookRotation(dir),680*Time.deltaTime);
  if(motor.isGrounded){lastGround=Time.time;if(verticalSpeed<0)verticalSpeed=-2;}
  if(Time.time-jumpQueued<.13f&&Time.time-lastGround<.12f&&Time.time>=hitUntil){verticalSpeed=Mathf.Sqrt(2*20*jumpHeight);jumpQueued=-10;lastGround=-10;ForestSound.Play("jump",transform.position,.55f);}
  verticalSpeed-=20*Time.deltaTime;
  Vector3 beforeMove=transform.position;var flags=motor.Move(((Combat.MovementOverride?Combat.Velocity:dir*(running?runSpeed:walkSpeed)*(AdventureProgress.Instance?AdventureProgress.Instance.Relics.MoveMultiplier:1)*(IsCharging&&Combat.ClassId!=2?.55f:1))+Vector3.up*verticalSpeed+impactVelocity)*Time.deltaTime);impactVelocity=Vector3.Lerp(impactVelocity,Vector3.zero,1-Mathf.Exp(-10*Time.deltaTime));movedSpeed=Vector3.ProjectOnPlane(transform.position-beforeMove,Vector3.up).magnitude/Mathf.Max(Time.deltaTime,.001f);if(animator){animator.speed=1;animator.SetFloat("MoveRate",State=="Walk"?Mathf.Clamp(movedSpeed/walkStrideSpeed,.1f,2.7f):State=="Run"?Mathf.Clamp(movedSpeed/runStrideSpeed,.1f,2.4f):1);}
  if((flags&CollisionFlags.Above)!=0&&verticalSpeed>0)verticalSpeed=0;
  if((!IsSpellCasting||MobileSpell)&&Time.time>=hitUntil&&(Time.time>=busyUntil||MobileSpell))ChangeState(IsCharging&&Combat.ClassId!=2?"Cast":!motor.isGrounded&&Time.time-lastGround>.10f?"Jump":dir.sqrMagnitude<.01f||movedSpeed<.08f?"Idle":running?"Run":"Walk");
 }
 public Vector2 MovementInput()=>new Vector2((Input.GetKey(KeyCode.D)||Input.GetKey(KeyCode.RightArrow)?1:0)-(Input.GetKey(KeyCode.A)||Input.GetKey(KeyCode.LeftArrow)?1:0),(Input.GetKey(KeyCode.W)||Input.GetKey(KeyCode.UpArrow)?1:0)-(Input.GetKey(KeyCode.S)||Input.GetKey(KeyCode.DownArrow)?1:0));
 public Vector3 AimPoint(){
  Ray ray=viewCamera.ScreenPointToRay(Input.mousePosition);
  if(Physics.Raycast(ray,out RaycastHit h,200,~((1<<8)|(1<<9)),QueryTriggerInteraction.Ignore)){
   var monster=h.collider.GetComponentInParent<SlimeMonster>();if(monster)return monster.HitPoint;
   var d=h.collider.GetComponentInParent<PracticeDummy>();return d?d.transform.position+Vector3.up*1.05f:h.point+Vector3.up*.75f;
  }
  Plane p=new Plane(Vector3.up,transform.position+Vector3.up*.8f);return p.Raycast(ray,out float t)?ray.GetPoint(t):transform.position+transform.forward*10+Vector3.up*.8f;
 }
 // Both inputs form one held action; releasing only one cannot fire twice.
 public void ProcessButtons(bool j,bool mouse,bool jumpPressed,Vector3 target){
  if(RpgUI.SuppressCombatInput){ClearBufferedInput();CancelCharge();held=false;return;}
  if(Time.timeScale==0||RpgUI.Blocking){ClearBufferedInput();CancelCharge();held=false;return;}
  bool now=j||mouse;
  if(now&&!held){ChargeUsesMouse=mouse;if(Combat.ClassId==1&&BufferWindow){bufferedKind=1;bufferedMouse=mouse;bufferedPoint=target;bufferedUntil=Time.time+.23f;}}
  Vector3 chosen=ChargeUsesMouse?target:transform.position+Vector3.up*.85f+transform.forward*30;aim=chosen;
  if(jumpPressed&&!IsDead)jumpQueued=Time.time;
  if(now&&(Combat.ClassId==1||Combat.ClassId==2)){
   if((!held||Time.time>=nextHeldRetry)&&!IsDead&&!IsCharging&&!IsSpellCasting&&!Combat.Evading&&!Combat.Defending){bool started=Combat.ClassId==1?Combat.SwordAttack(chosen,ChargeUsesMouse):BeginCharge(chosen);nextHeldRetry=started?0:Time.time+.08f;}
  }else if(now&&!IsCharging&&Time.time>=nextHeldRetry){if(!BeginCharge(chosen))nextHeldRetry=Time.time+.06f;}
  if(!now&&held)ReleaseCharge(chosen);
  held=now;
 }
 public bool BeginCharge(Vector3 target){
  if(IsDead||IsSpellCasting||IsCharging||Time.time<nextCast||Time.time<hitUntil||RpgUI.Blocking)return false;
  if(stats&&!stats.CanUseWeapon())return false;if(stats&&stats.Mana<2){ForestSound.Play("ui_error");RpgUI.Toast(Loc.T("마나가 부족합니다.","Not enough mana.","マナが足りません。"));return false;}
  if(Combat.ClassId==2&&!Combat.BeginBow(ChargeUsesMouse))return false;
  aim=target;IsCharging=true;chargeStarted=Time.time;if(Combat.ClassId==2){fullChargeSeconds=.6f;PlayOverlay("BowDraw");}else{ChangeState("Cast",true);chargeVisual=PlaygroundFX.Charge(this);}ForestSound.Instance?.ChargeStarted(this);return true;
 }
 public bool ReleaseCharge(Vector3 target){
  if(!IsCharging)return false;
  float power=Charge01;if(power>=.999f)ForestSound.Instance?.ChargeReady(this);CancelCharge(true);if(IsDead||Time.time<hitUntil)return false;
  if(Combat.ClassId==2){if(power<.999f)return false;nextCast=Time.time+.12f;return Combat.FireBow(target,ChargeUsesMouse);}
  if(stats&&(!stats.CanUseWeapon()||!stats.Spend(Mathf.Lerp(2,8,power))))return false;
  ShotsFired++;nextCast=Time.time+Mathf.Lerp(.22f,.48f,power)/(stats?stats.CastSpeed:1);busyUntil=Time.time+.12f;
  Vector3 origin=transform.position+Vector3.up*.85f;SlimeMonster lockedTarget=null;if(Combat.ClassId==0&&!ChargeUsesMouse){lockedTarget=WitchAutoTarget();target=lockedTarget?lockedTarget.HitPoint:origin+transform.forward*30;}
  Vector3 dir=(target-origin).normalized;if(dir.sqrMagnitude<.1f)dir=transform.forward;
  Vector3 flat=Vector3.ProjectOnPlane(dir,Vector3.up);if(flat.sqrMagnitude>.01f)transform.rotation=Quaternion.LookRotation(flat);
  LastShotDirection=dir;var hit=stats?stats.EnergyHit(power,dir):new HitData{damage=DamageForCharge(power),owner=this,charge=power,knockback=2,direction=dir};if(AdventureProgress.Instance)hit=AdventureProgress.Instance.Relics.BasicHit(hit);LastDamage=hit.damage;var roster=GetComponent<HeroRoster>();if(roster&&roster.Selected==1)ElementalSpells.Melee(this,dir,hit);else {RpgVFX.Fire(origin+dir*.38f,dir,hit,lockedTarget);if(roster&&roster.Selected==2){foreach(var bolt in FindObjectsByType<MagicProjectile>())if(bolt.owner==this&&Vector3.Distance(bolt.transform.position,origin)<1)bolt.arrow=true;}}ChangeState(roster&&roster.Selected>0?"Attack":"Cast",true);ForestSound.Play(power>.65f?"energy_heavy":"energy_light",origin,.8f);return true;
 }
 // Select at release, so enemies that move or die during charging cannot leave a stale aim.
 public SlimeMonster WitchAutoTarget(){SlimeMonster best=null;float nearest=18;foreach(var e in FindObjectsByType<SlimeMonster>()){if(e.IsDead)continue;float distance=ClassCombat.Flat(e.transform.position-transform.position).magnitude;if(distance>=nearest)continue;if(Physics.Linecast(transform.position+Vector3.up*.85f,e.HitPoint,(1<<11)|(1<<13)))continue;nearest=distance;best=e;}return best;}
 public static int DamageForCharge(float power)=>Mathf.RoundToInt(Mathf.Lerp(12,80,Mathf.Pow(Mathf.Clamp01(power),1.35f)));
 public bool TryCastAt(Vector3 target){if(!BeginCharge(target))return false;return ReleaseCharge(target);}
 public void CancelCharge(bool released=false){if(IsCharging)ForestSound.Instance?.ChargeStopped(released);IsCharging=false;if(chargeVisual)Destroy(chargeVisual.gameObject);}
 void OnApplicationFocus(bool focused){if(!focused){ClearBufferedInput();CancelChannel();CancelCharge();held=false;jumpQueued=-10;}}
 void OnDisable(){CancelChannel();CancelCharge();}
 public void TakeDamage(int damage){TakeDamage(damage,false);}
 public void TakeDamage(int damage,bool critical,SlimeMonster attacker=null){if(IsDead||ArrivalProtected||damage<=0||Combat.AvoidDamage(attacker)||Time.time<hitUntil)return;Health=Mathf.Max(0,Health-damage);AdventureProgress.Instance?.PlayerDamaged();ForestSound.Play(IsDead?"death":"player_hit",transform.position,.8f);RpgVFX.DamageText(transform.position+Vector3.up*.65f,damage,critical,true);RpgVFX.Impact(transform.position+Vector3.up*.8f,critical);CancelCharge();if(IsDead){ClearBufferedInput();CancelChannel();Combat.Interrupt();int layer=animator?animator.GetLayerIndex("MobileCast"):-1;if(layer>=0)animator.SetLayerWeight(layer,0);spellUntil=guardUntil=0;busyUntil=0;ChangeState("Death",true);}else if(Combat.BasicAttacking){hitUntil=Time.time+.35f;}else if(!KnockbackImmune){ClearBufferedInput();CancelChannel();Combat.Interrupt();spellUntil=0;busyUntil=0;hitUntil=Time.time+.35f;ChangeState("Hit",true);}}
 public void BeginSpell(float seconds,bool guard,bool allowMovement=false){spellAllowsMovement=allowMovement;CancelCharge();spellUntil=Time.time+seconds;busyUntil=spellUntil;if(guard)guardUntil=spellUntil;if(allowMovement){int layer=animator?animator.GetLayerIndex("MobileCast"):-1;if(layer>=0){animator.speed=1;animator.SetLayerWeight(layer,1);animator.CrossFadeInFixedTime("Cast",.08f,layer,0);}else ChangeState("Cast",true);}else ChangeState("Cast",true);}
 public void Knockback(Vector3 velocity){if(!KnockbackImmune)impactVelocity=Vector3.ProjectOnPlane(velocity,Vector3.up);}
 public void SetMaxHealth(int value,bool refill){maxHealth=Mathf.Max(1,value);Health=refill?maxHealth:Mathf.Min(Health,maxHealth);}
 public void Heal(int value){if(IsDead)return;int actual=Mathf.Min(value,maxHealth-Health);Health+=actual;if(actual>0)RpgVFX.HealText(transform.position+Vector3.up*.6f,actual);}
 public void RestoreHealth(){if(IsDead)return;Heal(maxHealth);hitUntil=0;if(stats)stats.RestoreMana();}
 public void SetCheckpoint(Vector3 point){startPosition=point;startRotation=transform.rotation;}
 public void Respawn(){if(RpgSession.Instance&&RpgSession.Instance.Playing)ForestSound.Play("revive",transform.position,.65f);ClearBufferedInput();CancelChannel();Combat.ResetCombat();CancelCharge();motor.enabled=false;transform.SetPositionAndRotation(startPosition,startRotation);motor.enabled=true;Health=maxHealth;if(stats)stats.RestoreMana();verticalSpeed=0;nextCast=hitUntil=busyUntil=spellUntil=guardUntil=0;impactVelocity=Vector3.zero;held=false;lastGround=jumpQueued=-10;ChangeState("Idle",true);AdventureProgress.Instance?.OnRespawn();}
 public void Teleport(Vector3 p){motor.enabled=false;transform.position=p;motor.enabled=true;verticalSpeed=0;lastGround=-10;}
 public void RecordShot(HitData hit,Vector3 dir){ShotsFired++;LastDamage=hit.damage;LastShotDirection=dir;}
 public void PlayOverlay(string name){int layer=animator?animator.GetLayerIndex("MobileCast"):-1;if(layer>=0){animator.SetLayerWeight(layer,1);animator.CrossFadeInFixedTime(name,.045f,layer,0);}}
 public void PlayAction(string name,float duration,bool mobile,bool guard=false){ActionName=name;BeginSpell(duration,guard,mobile);if(mobile){PlayOverlay(name);State=name;}else ChangeState(name,true);}
 void ChangeState(string state,bool force=false){if(State==state&&!force)return;State=state;if(animator)animator.CrossFadeInFixedTime(state,.1f,0,0);}
}
}
