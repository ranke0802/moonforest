using UnityEngine;using System;using System.IO;using System.Collections;using System.Collections.Generic;
namespace WitchPlayground {
public sealed class SwordTrailVerification:MonoBehaviour {
 static bool launched;string folder;int errors;bool done;float began;WitchPlayer p;RpgProgress stats;HeroRoster roster;ClassCombat combat;
 readonly List<string> checks=new List<string>(),failures=new List<string>();
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Init(){var a=Environment.GetCommandLineArgs();int i=Array.IndexOf(a,"--sword-trail-verify");if(!launched&&i>=0&&i+1<a.Length){launched=true;var v=new GameObject("Sword trail verification").AddComponent<SwordTrailVerification>();v.folder=a[i+1];Application.runInBackground=true;}}
 void Check(bool ok,string label){(ok?checks:failures).Add(label);Debug.Log((ok?"TRAIL PASS ":"TRAIL FAIL ")+label);}
 void Update(){if(!done&&Time.realtimeSinceStartup-began>90)Finish("Timed out");}
 IEnumerator Wait(float t){yield return new WaitForSeconds(t);}
 IEnumerator Start(){began=Time.realtimeSinceStartup;Directory.CreateDirectory(folder);Application.logMessageReceived+=(m,s,t)=>{if(t==LogType.Error||t==LogType.Exception)errors++;};yield return Wait(.8f);
 p=FindAnyObjectByType<WitchPlayer>();p.TestControl=true;stats=p.GetComponent<RpgProgress>();roster=p.GetComponent<HeroRoster>();combat=p.Combat;
 foreach(var e in FindObjectsByType<SlimeMonster>())e.TestIdle=true;
 var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.layer=10;floor.transform.position=new Vector3(2000,-.25f,0);floor.transform.localScale=new Vector3(80,.5f,80);
 stats.ResetProgress();roster.Select(1);p.Respawn();p.Teleport(new Vector3(2000,.02f,0));RpgUI.Instance.ReleaseInputForTest();p.ProcessButtons(false,false,false,Vector3.zero);stats.ranks=new[]{1,1,1,1};stats.CritOverride=0;
 var view=Camera.main.GetComponent<PlaygroundView>();view.yaw=160;view.pitch=28;view.focusHeight=.8f;Camera.main.orthographicSize=1.9f;view.Snap();
 var light=new GameObject("Review fill").AddComponent<Light>();light.type=LightType.Point;light.range=20;light.intensity=1.1f;light.transform.position=p.transform.position+new Vector3(1,3,3);yield return Wait(.2f);
 var baked=new Mesh();
 foreach(float yaw in new[]{0f,90f,180f,270f}){
  combat.ResetCombat();p.transform.rotation=Quaternion.Euler(0,yaw,0);view.yaw=yaw+160;view.Snap();
  for(int step=1;step<=3;step++){
   stats.RestoreMana();int shots=p.ShotsFired;Check(combat.SwordAttack(p.transform.position+p.transform.forward,false),"Yaw "+yaw+" combo "+step+" starts");var trail=p.GetComponent<SwordTrail>();
   Check(trail.BoundSkin&&trail.BoundVertex>=0,"Yaw "+yaw+" combo "+step+" bound to rigid sword geometry");
   float start=Time.time,error=0,firstY=0,lastY=0,firstX=0,lastX=0;int samples=0;bool early=false,late=false,hasMesh=false,captured=false;
   while(Time.time-start<(step==3?.84f:.64f)){
    yield return new WaitForEndOfFrame();float t=Time.time-start;
    if(trail.Emitting){samples++;trail.BoundSkin.BakeMesh(baked,true);var actual=trail.BoundSkin.transform.TransformPoint(baked.vertices[trail.BoundVertex]);error=Mathf.Max(error,Vector3.Distance(trail.LastTip,actual));var local=p.transform.InverseTransformPoint(actual);if(samples==1){firstX=local.x;firstY=local.y;}lastX=local.x;lastY=local.y;}
    if(t<.15f&&trail.Visible)early=true;if(t>(step==3?.70f:.54f)&&trail.Visible)late=true;hasMesh|=trail.Visible;
    if(!captured&&yaw==0&&t>(step==3?.45f:.29f)){captured=true;ScreenCapture.CaptureScreenshot(Path.Combine(folder,"combo-"+step+".png"));}
   }
   Check(samples>=5&&hasMesh,"Yaw "+yaw+" combo "+step+" has visible swept blade ribbon");
   Check(error<.015f,"Yaw "+yaw+" combo "+step+" follows baked sword within 1.5cm ("+error.ToString("F4")+"m)");
   Check(!early&&!late&&!trail.Visible,"Yaw "+yaw+" combo "+step+" excludes windup and recovery; clears trail");
   Check(step==1?lastX<firstX-.6f:step==2?lastX>firstX+.6f:lastY<firstY-.6f,"Yaw "+yaw+" combo "+step+" follows correct slash direction");
   Check(p.ShotsFired==shots+1,"Yaw "+yaw+" combo "+step+" retains one impact");
   Check(FindObjectsByType<CombatSprite>().Length==0,"Yaw "+yaw+" combo "+step+" does not spawn centered ground or billboard slash");
   yield return Wait(.04f);
  }
 }
 combat.ResetCombat();stats.RestoreMana();combat.SwordAttack(p.transform.position+p.transform.forward,false);yield return Wait(.24f);var fx=p.GetComponent<SwordTrail>();Check(fx.Visible,"Trail is present before pause");RpgUI.Instance.Open(RpgUI.Window.Pause);int count=fx.SampleCount;var tip=fx.LastTip;yield return new WaitForSecondsRealtime(.2f);Check(fx.SampleCount==count&&fx.LastTip==tip,"Pause does not stretch or age the trail");RpgUI.Instance.Close();RpgUI.Instance.ReleaseInputForTest();combat.Interrupt();Check(!fx.Visible&&fx.SampleCount==0,"Interrupted attack clears ribbon immediately");yield return Wait(.4f);
 combat.ResetCombat();stats.RestoreMana();p.Respawn();RpgUI.Instance.ReleaseInputForTest();combat.SwordAttack(p.transform.position+p.transform.forward,false);yield return Wait(.24f);roster.Select(2);yield return null;Check(!fx.Visible&&!fx.Emitting,"Changing class clears the warrior ribbon");
 roster.Select(1);p.Respawn();p.Teleport(p.Spawn);p.ProtectArrival();RpgUI.Instance.ReleaseInputForTest();view.FactoryCamera();yield return Wait(.2f);
 p.transform.rotation=Quaternion.Euler(0,20,0);combat.ResetCombat();
 for(int step=1;step<=3;step++){stats.RestoreMana();combat.SwordAttack(p.transform.position+p.transform.forward,false);yield return Wait(step==3?.44f:.28f);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(folder,"forest-combo-"+step+".png"));yield return Wait(.55f);}
 Destroy(baked);Check(errors==0,"No runtime errors");Finish(null);
 }
 [Serializable]class Report{public bool passed;public string[] checks,failures;public int runtimeErrors;}
 void Finish(string issue){if(done)return;done=true;if(issue!=null)failures.Add(issue);File.WriteAllText(Path.Combine(folder,"sword-trail-tests.json"),JsonUtility.ToJson(new Report{passed=failures.Count==0,checks=checks.ToArray(),failures=failures.ToArray(),runtimeErrors=errors},true));Application.Quit(failures.Count==0?0:1);}
}
}
