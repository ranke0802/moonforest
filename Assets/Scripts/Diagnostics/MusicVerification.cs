using UnityEngine;using System;using System.IO;using System.Collections;using System.Collections.Generic;
namespace WitchPlayground {
public sealed class MusicVerification:MonoBehaviour {
 static bool launched;string folder;bool done;int errors;float began;readonly List<string> checks=new List<string>(),failures=new List<string>();
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Init(){var a=Environment.GetCommandLineArgs();int i=Array.IndexOf(a,"--music-verify");if(!launched&&i>=0&&i+1<a.Length){launched=true;var v=new GameObject("Music verification").AddComponent<MusicVerification>();v.folder=a[i+1];DontDestroyOnLoad(v.gameObject);Application.runInBackground=true;}}
 void Check(bool ok,string label){(ok?checks:failures).Add(label);Debug.Log((ok?"MUSIC PASS ":"MUSIC FAIL ")+label);}
 IEnumerator Wait(float t){yield return new WaitForSecondsRealtime(t);}
 void Update(){if(!done&&Time.realtimeSinceStartup-began>65)Finish("Timed out");}
 IEnumerator Shot(string name){yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(folder,name+".png"));yield return null;}
 IEnumerator Start(){began=Time.realtimeSinceStartup;Directory.CreateDirectory(folder);Application.logMessageReceived+=(m,s,t)=>{if(t==LogType.Error||t==LogType.Exception)errors++;};yield return Wait(.6f);
 var music=ForestMusic.Instance;var session=RpgSession.Instance;var p=FindAnyObjectByType<WitchPlayer>();p.TestControl=true;
 Check(music&&music.Testing,"Test settings are isolated from player settings");PlayerPrefs.DeleteKey(music.VolumeKey);PlayerPrefs.DeleteKey(music.MuteKey);music.ReloadSettings();session.ShowTitleForTest();yield return Wait(1.2f);
 var source=music.Source;Check(source.clip&&Mathf.Abs(source.clip.length-56.8421f)<.02f,"56.84 second soundtrack loads");Check(source.loop&&source.spatialBlend==0&&source.isPlaying,"Title plays looping stereo 2D music");Check(Mathf.Abs(source.volume-.55f)<.02f,"Default volume fades in to 55 percent");
 int sample=source.timeSamples;yield return Wait(.2f);Check(Time.timeScale==0&&source.timeSamples>sample,"Title music advances while game time is paused");
 float[] audio=new float[2048];float power=0;float until=Time.realtimeSinceStartup+1;
 while(Time.realtimeSinceStartup<until){source.GetOutputData(audio,0);float current=0;foreach(float v in audio)current+=v*v;power=Mathf.Max(power,current);yield return null;}
 Debug.Log("MUSIC OUTPUT power="+power+" virtual="+source.isVirtual+" listeners="+FindObjectsByType<AudioListener>().Length+" listenerVolume="+AudioListener.volume);
 Check(power>0.0000001f,"Audio source produces non-silent output");
 var ui=RpgUI.Instance;yield return Shot("title-bgm");session.Creating=true;sample=source.timeSamples;yield return Wait(.25f);Check(source.timeSamples>sample&&source.isPlaying,"Character selection preserves the same playback position");yield return Shot("creation-bgm");
 foreach(int lang in new[]{1,2}){Loc.Language=lang;yield return Shot("creation-language-"+lang);}Loc.Language=0;
 music.SetVolume(.23f);yield return Wait(.7f);Check(Mathf.Abs(source.volume-.23f)<.01f,"Volume control changes playback gain");music.SetMuted(true);yield return Wait(.7f);Check(source.volume==0&&source.isPlaying,"Mute silences without restarting the track");Check(PlayerPrefs.GetFloat(music.VolumeKey,-1)==.23f&&PlayerPrefs.GetInt(music.MuteKey,0)==1,"Volume and mute settings are saved");music.ReloadSettings();Check(music.Muted&&music.Volume==.23f,"Settings reload preserves both controls");music.SetMuted(false);yield return Wait(.5f);Check(source.volume>.2f,"Unmute restores the chosen level");
 music.SetVolume(4);Check(music.Volume==1,"Volume clamps above maximum");music.SetVolume(-4);Check(music.Volume==0,"Volume clamps below zero");music.SetVolume(.55f);yield return Wait(.6f);
 source.time=source.clip.length-.15f;yield return Wait(.45f);Check(source.isPlaying&&source.time<1,"Actual audio playback wraps at the loop boundary");
 Check(session.NewGame("MusicTest",1),"Game starts from character creation");p.TestControl=true;yield return Wait(.2f);Check(source.volume>0&&source.volume<.55f,"Entering gameplay fades music rather than cutting it");yield return Wait(1.1f);Check(!source.isPlaying&&source.volume==0,"Title music stops after the gameplay transition");ui.Open(RpgUI.Window.Pause);yield return Wait(.2f);Check(!source.isPlaying,"Pause menu does not restart title music");yield return Shot("pause-bgm");ui.Close();
 var instance=music;session.ReturnToTitle();yield return Wait(1.6f);Check(ForestMusic.Instance==instance&&FindObjectsByType<ForestMusic>().Length==1,"Returning to title retains exactly one music player");Check(source.isPlaying&&source.volume>.5f,"Returning to title fades the music back in");Check(ForestMusic.Instance.Volume==.55f,"Music setting survives scene reload");
 music.SetMuted(true);yield return Wait(.7f);music.SaveSettings();PlayerPrefs.DeleteKey(music.VolumeKey);PlayerPrefs.DeleteKey(music.MuteKey);PlayerPrefs.Save();Check(errors==0,"No runtime errors");Finish(null);
 }
 [Serializable]class Report{public bool passed;public string[] checks,failures;public int runtimeErrors;}
 void Finish(string issue){if(done)return;done=true;if(issue!=null)failures.Add(issue);File.WriteAllText(Path.Combine(folder,"music-tests.json"),JsonUtility.ToJson(new Report{passed=failures.Count==0,checks=checks.ToArray(),failures=failures.ToArray(),runtimeErrors=errors},true));Application.Quit(failures.Count==0?0:1);}
}
}
