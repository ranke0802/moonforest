using UnityEngine;
using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed partial class AdventureVerification {
 IEnumerator LiveAI(){
  Check(RpgUI.ComposeName("유리","카",2,2)=="유리카","Korean final composed syllable is retained");Check(RpgUI.ComposeName("ㅇㅇ","ㅇ",2,2)=="ㅇㅇㅇ","Final composing jamo is retained");Check(RpgUI.ComposeName("유카","리",1,1)=="유리카","Composition inserts at cursor");
  session.NewGame("LiveAI",0);ClearUI();a.TestFreezeEnemies=false;a.AcceptMain();ClearUI();yield return Wait(.3f);
  if(Array.IndexOf(Environment.GetCommandLineArgs(),"--native-check")>=0){yield return NativeKeys();yield break;}
  var ranged=a.Enemies["road0"];p.Teleport(AdventureProgress.Safe(ranged.transform.position+Vector3.right*8));p.ProtectArrival();Camera.main.GetComponent<PlaygroundView>().Snap();yield return Wait(.2f);var rangeStart=ranged.transform.position;ranged.ReceiveHit(new HitData{damage=1,owner=p});yield return Wait(.8f);Check(ranged.State=="Chasing"&&ClassCombat.Flat(ranged.transform.position-rangeStart).magnitude>.25f,"Distant attack provokes pursuit outside passive aggro radius");
  p.ProcessButtons(false,false,false,Vector3.zero);yield return Wait(.5f);stats.RestoreMana();p.ProcessButtons(true,false,false,Vector3.zero);yield return Wait(.15f);var locked=p.WitchAutoTarget();int hp=locked?locked.Health:0;p.ProcessButtons(false,false,false,Vector3.zero);yield return null;Check(FindObjectsByType<MagicProjectile>().Any(b=>b.homingTarget==locked&&locked),"Keyboard energy locks a live target for flight");yield return Wait(.9f);Check(locked&&locked.Health<hp,"Keyboard energy hits a moving quest monster on forest terrain");
  foreach(var phase in new[]{AdventureStage.Road,AdventureStage.Purify,AdventureStage.Elite}){a.State.stage=phase;a.ApplyWorld();yield return Wait(.2f);
  foreach(var pair in a.Enemies.Where(x=>x.Value.gameObject.activeSelf)){var e=pair.Value;p.RestoreHealth();p.ProtectArrival();
   p.Teleport(AdventureProgress.Safe(e.transform.position+Vector3.right*2.8f));Camera.main.GetComponent<PlaygroundView>().Snap();Physics.SyncTransforms();yield return Wait(.2f);
   Vector3 before=e.transform.position;float distance=ClassCombat.Flat(p.transform.position-before).magnitude;
   Debug.Log("LIVE_AI before "+pair.Key+" enabled="+e.enabled+" idle="+e.TestIdle+" boss="+e.isBoss+" pos="+before+" player="+p.transform.position+" controller="+e.GetComponent<CharacterController>().enabled);
   yield return Wait(1.2f);
   Check(ClassCombat.Flat(e.transform.position-before).magnitude>.15f,pair.Key+" actually moves toward the player");
   Debug.Log("LIVE_AI after "+pair.Key+" state="+e.State+" pos="+e.transform.position+" distance="+distance);
   before=e.transform.position;e.ReceiveHit(new HitData{damage=1,knockback=3,direction=Vector3.left,owner=p});yield return Wait(.18f);
   bool moved=ClassCombat.Flat(e.transform.position-before).magnitude>.025f;bool contact=(e.GetComponent<CharacterController>().collisionFlags&CollisionFlags.Sides)!=0;
   Check(e.LastKnockback.sqrMagnitude>1&&(moved||contact),pair.Key+" knockback moves or stops at a solid side contact");
  }
  }
  foreach(var mode in new[]{"normal","1080p"}){
  if(mode=="no-minimap")p.GetComponent<ForestMinimap>().enabled=false;
  if(mode=="no-aim-ring")p.GetComponent<AimAssist>().enabled=false;
  if(mode=="no-shadows")FindAnyObjectByType<ForestOptions>().SetEnvironmentShadows(false);
  if(mode=="1080p")Screen.SetResolution(1920,1080,FullScreenMode.Windowed);
  yield return Wait(.5f);var frames=new List<float>();float end=Time.realtimeSinceStartup+4;
  while(Time.realtimeSinceStartup<end){frames.Add(Time.unscaledDeltaTime*1000);if(p.Health<p.maxHealth/2)p.RestoreHealth();yield return null;}
  frames.Sort();Debug.Log("LIVE_PERF "+mode+" resolution="+Screen.width+"x"+Screen.height+" avgMs="+frames.Average()+" p95Ms="+frames[(int)(frames.Count*.95f)]+" samples="+frames.Count);
  }
  yield return Shot("live-quest-ai");Check(ForestMusic.Instance.Source&&ForestMusic.Instance.Source.isPlaying&&ForestMusic.Instance.Source.volume>0,"Exploration BGM plays during quest combat");
  ForestMusic.Instance.Source.Stop();yield return Wait(.15f);Check(ForestMusic.Instance.Source.isPlaying,"BGM recovers if an audio source was stopped");
  Finish(null);
 }
}
}
