using UnityEngine;using System;
namespace WitchPlayground {
// Shared musical theme, separate title/exploration/boss arrangements, soft transitions.
public sealed class ForestMusic:MonoBehaviour {
 public static ForestMusic Instance{get;private set;}
 public float Volume{get;private set;}=.55f;public bool Muted{get;private set;}public bool Testing{get;private set;}
 public AudioSource Source=>sources.Length>0?sources[current]:null;public string CurrentTrack=>names[current];
 public string VolumeKey=>Testing?"WitchRPG.Test.MusicVolume":"WitchRPG.MusicVolume";public string MuteKey=>Testing?"WitchRPG.Test.MusicMuted":"WitchRPG.MusicMuted";
 readonly string[] names={"MoonlitFirstSteps","MoonlitForest","SilverMoonwolf"};AudioSource[] sources=new AudioSource[0];bool[] started=new bool[3];int current;float duckUntil,bossUntil,saveAt;bool dirty,suspended;
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Init(){if(!Instance)new GameObject("Forest music").AddComponent<ForestMusic>();}
 void Awake(){if(Instance){Destroy(gameObject);return;}Instance=this;DontDestroyOnLoad(gameObject);foreach(var arg in Environment.GetCommandLineArgs())if(arg.Contains("verify")||arg.Contains("ui-test"))Testing=true;ReloadSettings();sources=new AudioSource[3];
  for(int i=0;i<3;i++){var s=gameObject.AddComponent<AudioSource>();s.playOnAwake=false;s.loop=true;s.spatialBlend=0;s.volume=0;s.priority=20;s.ignoreListenerPause=true;s.clip=Resources.Load<AudioClip>("Audio/"+names[i]);sources[i]=s;}
 }
 public void ReloadSettings(){Volume=Mathf.Clamp01(PlayerPrefs.GetFloat(VolumeKey,.55f));Muted=PlayerPrefs.GetInt(MuteKey,0)!=0;}
 public void SetVolume(float value){value=Mathf.Clamp01(value);if(Mathf.Abs(value-Volume)<.001f)return;Volume=value;dirty=true;saveAt=Time.realtimeSinceStartup+.35f;}
 public void SetMuted(bool value){if(Muted==value)return;Muted=value;dirty=true;saveAt=Time.realtimeSinceStartup+.35f;}
 public void SaveSettings(){if(!dirty)return;PlayerPrefs.SetFloat(VolumeKey,Volume);PlayerPrefs.SetInt(MuteKey,Muted?1:0);PlayerPrefs.Save();dirty=false;}
 public void Duck(float seconds){duckUntil=Mathf.Max(duckUntil,Time.unscaledTime+seconds);}
 void Update(){if(dirty&&Time.realtimeSinceStartup>=saveAt)SaveSettings();var session=RpgSession.Instance;if(!session)return;int desired=0;float context=1;
  if(session.Playing){desired=1;var p=RpgProgress.Instance.player;var moon=MoonwolfEvent.Instance;
   if(moon&&moon.boss&&moon.boss.activeInHierarchy&&!session.BossDefeated){var health=moon.boss.GetComponent<SlimeMonster>();if(health&&!health.IsDead&&ClassCombat.Flat(moon.boss.transform.position-p.transform.position).magnitude<(current==2?32:23))bossUntil=Time.unscaledTime+5;}else bossUntil=0;
   if(Time.unscaledTime<bossUntil)desired=2;
   context=p.IsDead?.16f:Time.timeScale==0?.5f:1;
  }else bossUntil=0;
  current=desired;bool audible=!Muted&&!suspended&&(Testing||Application.isFocused);float duck=Time.unscaledTime<duckUntil?.48f:1;
  for(int i=0;i<sources.Length;i++){var s=sources[i];if(!s.clip)continue;if(i==desired&&!s.isPlaying){if(started[i])s.UnPause();if(!s.isPlaying)s.Play();started[i]=true;}float target=i==desired&&audible?Volume*context*duck:0;s.volume=Mathf.MoveTowards(s.volume,target,Time.unscaledDeltaTime*.4f);if(i!=desired&&s.volume<=.0001f&&s.isPlaying)s.Pause();}
 }
 void OnApplicationPause(bool paused){suspended=paused;if(paused)SaveSettings();}void OnApplicationQuit(){SaveSettings();}void OnDestroy(){if(Instance==this){SaveSettings();Instance=null;}}
}
}
