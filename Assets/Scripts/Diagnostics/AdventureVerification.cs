using UnityEngine;
using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed partial class RpgUI {internal bool NameEditorMatchesForTest(string value)=>entered==value&&nameEditor!=null&&nameEditor.text==value;}
public sealed partial class AdventureVerification:MonoBehaviour {
 static bool launched;string folder;float began;bool done;int errors;readonly List<string> checks=new List<string>(),failures=new List<string>();RpgSession session;RpgProgress stats;WitchPlayer p;AdventureProgress a;HeroRoster roster;string savedTest;bool hadTest;
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Init(){var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--adventure-verify");if(!launched&&i>=0&&i+1<args.Length){launched=true;var test=new GameObject("Adventure verification").AddComponent<AdventureVerification>();test.folder=args[i+1];Application.runInBackground=true;}}
 void Check(bool value,string text){(value?checks:failures).Add(text);Debug.Log((value?"ADVENTURE PASS ":"ADVENTURE FAIL ")+text);}
 void ClearUI(){while(stats.PendingChoices>0)stats.Choose(0);if(RpgUI.Instance.ActiveWindow!=RpgUI.Window.None)RpgUI.Instance.Close();RpgUI.Instance.ReleaseInputForTest();Time.timeScale=1;p.ProcessButtons(false,false,false,Vector3.zero);}
 IEnumerator Wait(float duration){yield return new WaitForSecondsRealtime(duration);}
 IEnumerator Shot(string name){yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(folder,name+".png"));yield return null;}
 IEnumerator Start(){began=Time.realtimeSinceStartup;Directory.CreateDirectory(folder);Application.logMessageReceived+=Log;yield return Wait(.6f);p=FindAnyObjectByType<WitchPlayer>();stats=p.GetComponent<RpgProgress>();roster=p.GetComponent<HeroRoster>();session=p.GetComponent<RpgSession>();a=p.GetComponent<AdventureProgress>();p.TestControl=true;a.TestFreezeEnemies=true;hadTest=PlayerPrefs.HasKey("WitchRPG.Test.v4");savedTest=PlayerPrefs.GetString("WitchRPG.Test.v4","");session.AllowTestStorage=true;
 if(Array.IndexOf(Environment.GetCommandLineArgs(),"--population-combat")>=0){yield return PopulationCombat();yield break;}
 if(Array.IndexOf(Environment.GetCommandLineArgs(),"--live-ai")>=0){yield return PopulationAI();yield break;}
 if(Array.IndexOf(Environment.GetCommandLineArgs(),"--name-probe")>=0){
  var args=Environment.GetCommandLineArgs();session.ShowTitleForTest();session.Creating=Array.IndexOf(args,"--name-from-title")<0;
  int ni=Array.IndexOf(args,"--expected-name"),ei=Array.IndexOf(args,"--expected-edit");bool inspected=false;
  Debug.Log("NAME_PROBE_READY");float until=Time.realtimeSinceStartup+60;
  while(!session.Playing&&Time.realtimeSinceStartup<until){
   if(ei>=0&&Input.GetKeyDown(KeyCode.F9)){Check(RpgUI.Instance.NameEditorMatchesForTest(args[ei+1]),"Visible input and backing editor preserve the complete name before submission");inspected=true;yield return Shot("name-editing");}
   yield return null;
  }
  if(ei>=0)Check(inspected,"Name editor checkpoint was inspected");
  if(ni>=0)Check(session.Playing&&session.PlayerName==args[ni+1],"Actual macOS IME name is saved without losing final character");
  yield return Shot("name-confirmed");Finish(null);yield break;
 }
 if(Array.IndexOf(Environment.GetCommandLineArgs(),"--menu-verify")>=0){yield return FreeMenuVerification();yield break;}
 if(Array.IndexOf(Environment.GetCommandLineArgs(),"--native-menu")>=0){yield return NativeFreeMenu();yield break;}
 yield return FreeHunt();
 }

 void Log(string m,string stack,LogType type){if(type==LogType.Error||type==LogType.Exception){errors++;File.AppendAllText(Path.Combine(folder,"errors.txt"),m+"\n"+stack+"\n");}}
 void Update(){if(!done&&began>0&&Time.realtimeSinceStartup-began>480)Finish("Timed out");}
 [Serializable]class Report{public bool passed;public string[] checks,failures;public int runtimeErrors;public float elapsedSeconds;}
 void Finish(string error){if(done)return;done=true;if(error!=null)failures.Add(error);File.WriteAllText(Path.Combine(folder,"adventure-tests.json"),JsonUtility.ToJson(new Report{passed=failures.Count==0&&errors==0,checks=checks.ToArray(),failures=failures.ToArray(),runtimeErrors=errors,elapsedSeconds=Time.realtimeSinceStartup-began},true));session.AllowTestStorage=false;if(hadTest)PlayerPrefs.SetString("WitchRPG.Test.v4",savedTest);else PlayerPrefs.DeleteKey("WitchRPG.Test.v4");Application.logMessageReceived-=Log;Application.Quit();}
}
}
