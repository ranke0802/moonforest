using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public static class ElementalSpells {
 public static RasterEffect Sprite(Vector3 p,int row,float size,float duration,bool ground=false){var fx=RpgVFX.Sprite(p,row,size,duration,ground);fx.expansion=true;fx.GetComponent<Renderer>().sharedMaterial=Resources.Load<Material>("RPG/ElementsMaterial");return fx;}
 public static void Ice(WitchPlayer p,HitData hit){var o=new GameObject("Three ice blade waves");o.AddComponent<IceVolley>().Init(p,hit);}
 public static void Meteor(WitchPlayer p,Vector3 target,HitData hit,float radius){var o=new GameObject("Meteor channel and burning ground");o.transform.position=target;var m=o.AddComponent<GrandMeteor>();m.player=p;m.channelToken=p.ChannelToken;m.hit=hit;m.radius=radius;}
 public static void HealOverTime(WitchPlayer p){ForestSound.Play("heal_start",p.transform.position,.65f);var old=p.GetComponent<Regeneration>();if(old)Object.Destroy(old);p.gameObject.AddComponent<Regeneration>();}
 public static void Melee(WitchPlayer player,Vector3 direction,HitData hit){RpgVFX.Sprite(player.transform.position+Vector3.up*.8f+direction*.9f,0,1.2f+hit.charge,.32f);foreach(var e in Object.FindObjectsByType<SlimeMonster>()){Vector3 d=e.HitPoint-player.transform.position;if(!e.IsDead&&Vector3.ProjectOnPlane(d,Vector3.up).magnitude<1.7f+hit.charge*.5f&&Vector3.Dot(direction,Vector3.ProjectOnPlane(d,Vector3.up).normalized)>.15f)e.ReceiveHit(hit);}}
}
public sealed class IceVolley:MonoBehaviour {
 WitchPlayer player;HitData hit;public static int WavesEmitted;
 public void Init(WitchPlayer p,HitData h){player=p;hit=h;}
 IEnumerator Start(){for(int wave=0;wave<3;wave++){if(!player||player.IsDead)break;WavesEmitted++;ForestSound.Play("ice_wave",player.transform.position,.6f,1+wave*.05f);for(int i=0;i<12;i++){Vector3 dir=Quaternion.Euler(0,i*30+wave*10,0)*Vector3.forward;var o=new GameObject("Ice blade");o.transform.position=player.transform.position+Vector3.up*.65f+dir*.5f;var blade=o.AddComponent<IceBlade>();blade.direction=dir;blade.hit=hit;}yield return new WaitForSeconds(.3f);}Destroy(gameObject);}
}
public sealed class IceBlade:MonoBehaviour {
 public Vector3 direction;public HitData hit;float age;RasterEffect image;
 void Start(){image=ElementalSpells.Sprite(transform.position,3,.85f,.3f);image.loop=true;}
 void Update(){if(Time.timeScale==0)return;float dist=9*Time.deltaTime;Vector3 next=transform.position;if(GroundSpellTravel.Step(ref next,direction,dist,.16f,.65f,out SlimeMonster e,out Vector3 impact)){transform.position=next;if(e){var damage=hit;damage.direction=direction;e.ReceiveHit(damage);e.SlowFor(3);if(Random.value<.30f)e.FreezeFor(1.5f);}Destroy(gameObject);return;}transform.position=next;if(image)image.transform.position=next;age+=Time.deltaTime;if(age>.7f)Destroy(gameObject);}
 void OnDestroy(){if(image)Destroy(image.gameObject);}
}
public sealed class GrandMeteor:MonoBehaviour {
 public WitchPlayer player;public HitData hit;public float radius=3.1f;public float Elapsed;public bool Impacted;public int channelToken;RasterEffect seal,meteor;readonly List<RasterEffect> orbit=new List<RasterEffect>();
 IEnumerator Start(){if(!player||!player.ValidChannel(channelToken)){Destroy(gameObject);yield break;}seal=ElementalSpells.Sprite(transform.position+Vector3.up*.12f,0,radius*2,1,true);seal.loop=true;seal.opacity=.42f;for(int i=0;i<3;i++){var fx=ElementalSpells.Sprite(player.transform.position,2,.5f,.7f);fx.loop=true;orbit.Add(fx);}while(Elapsed<3){if(!player||!player.ValidChannel(channelToken)){Cleanup();Destroy(gameObject);yield break;}Elapsed=3-player.ChannelRemaining;for(int i=0;i<orbit.Count;i++){float angle=Time.time*4+i*Mathf.PI*2/3;orbit[i].transform.position=player.transform.position+new Vector3(Mathf.Cos(angle)*.65f,.7f+Mathf.Sin(angle*2)*.1f,Mathf.Sin(angle)*.65f);}if(Elapsed>2.2f&&!meteor){ForestSound.Play("meteor_fall",transform.position,.7f);meteor=ElementalSpells.Sprite(transform.position+Vector3.up*8,1,3.2f,.7f);meteor.loop=true;}if(meteor)meteor.transform.position=transform.position+Vector3.up*Mathf.Lerp(8,.4f,(Elapsed-2.2f)/.8f);yield return null;}
  if(!player||!player.ValidChannel(channelToken)){Destroy(gameObject);yield break;}if(!player.CompleteChannel(channelToken)){Destroy(gameObject);yield break;}Impacted=true;ForestSound.Play("meteor_hit",transform.position,1);RpgVFX.Area(transform.position,radius,hit);ElementalSpells.Sprite(transform.position+Vector3.up*1.8f,1,radius*1.4f,.8f);RpgVFX.Impact(transform.position+Vector3.up*.9f,true);Camera.main.GetComponent<PlaygroundView>().Shake(.35f,.12f);Cleanup();
  var fires=new List<RasterEffect>();for(int f=0;f<5;f++){Vector3 pos=transform.position+Quaternion.Euler(0,f*72,0)*Vector3.forward*(radius*.45f);if(Physics.Raycast(pos+Vector3.up*40,Vector3.down,out RaycastHit gh,80,1<<10))pos=gh.point;var flame=ElementalSpells.Sprite(pos+Vector3.up*.8f,2,1.8f,1);flame.loop=true;flame.opacity=.6f;fires.Add(flame);}var ground=ElementalSpells.Sprite(transform.position+Vector3.up*.1f,0,radius*2,1,true);ground.loop=true;ground.opacity=.3f;
  for(int i=0;i<4;i++){yield return new WaitForSeconds(1);var tick=hit;tick.damage=Mathf.RoundToInt(hit.damage*.12f);tick.critical=false;tick.knockback=0;tick.charge=0;RpgVFX.Area(transform.position,radius,tick);}foreach(var fire in fires)if(fire)Destroy(fire.gameObject);Destroy(ground.gameObject);Destroy(gameObject);
 }
 void Cleanup(){if(seal)Destroy(seal.gameObject);if(meteor)Destroy(meteor.gameObject);foreach(var fx in orbit)if(fx)Destroy(fx.gameObject);orbit.Clear();}
 void OnDestroy(){Cleanup();}
}
public sealed class Regeneration:MonoBehaviour {
 public int Ticks;IEnumerator Start(){var p=GetComponent<WitchPlayer>();for(int i=0;i<5;i++){yield return new WaitForSeconds(1);if(p.IsDead)break;p.Heal(Mathf.RoundToInt(p.maxHealth*.1f));ForestSound.Play("heal_tick",p.transform.position,.4f);RpgVFX.Heal(p.transform.position);Ticks++;}Destroy(this);}
}
}
