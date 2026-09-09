using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections.Generic;
namespace WitchPlayground {
// Bounded voice pool, independent randomization, and player-relative attenuation for the quarter view.
[DefaultExecutionOrder(100)]
public sealed class ForestSound:MonoBehaviour {
 public static ForestSound Instance {get;private set;}
 public float EffectsVolume {get;private set;}=.8f;public float AmbientVolume {get;private set;}=.45f;
 public bool EffectsMuted {get;private set;}public bool AmbientMuted {get;private set;}
 public readonly Dictionary<string,int> Played=new Dictionary<string,int>();
 public int ActiveVoices{get{int n=0;foreach(var v in voices)if(v.source.isPlaying)n++;return n;}}
 public int VoiceLimit=>18;public int MissingClips{get;private set;}
 class Voice{public AudioSource source;public string key;public Vector3? at;public float gain,began;public bool ui;public int priority;}
 readonly List<Voice> voices=new List<Voice>();readonly Dictionary<string,AudioClip> clips=new Dictionary<string,AudioClip>();readonly Dictionary<string,float> last=new Dictionary<string,float>();readonly System.Random random=new System.Random(412);
 AudioSource wind,crickets,torch,bee,charge,burn;WitchPlayer player;TorchGlow[] torches;float scanAt,footTravel,airSince;Vector3 lastPosition;bool wasGrounded,readyPlayed;float beeGain,torchGain,burnGain;string chargeKey;bool dirty,wasDead;float lowHealthAt;float headroom=1;
 bool Testing=>ForestMusic.Instance&&ForestMusic.Instance.Testing;string Prefix=>Testing?"WitchRPG.Test.":"WitchRPG.";
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]static void Init(){if(!Instance)new GameObject("Forest soundscape").AddComponent<ForestSound>();}
 void Awake(){if(Instance){Destroy(gameObject);return;}Instance=this;DontDestroyOnLoad(gameObject);
  foreach(var c in Resources.LoadAll<AudioClip>("Audio/SFX"))clips[c.name]=c;
  for(int i=0;i<VoiceLimit;i++)voices.Add(new Voice{source=NewSource("Effect "+i)});
  wind=Loop("ambient_wind");crickets=Loop("ambient_crickets");torch=Loop("torch_fire");bee=Loop("bee_buzz");burn=Loop("burn");charge=NewSource("Charge loop");charge.loop=true;
  SceneManager.sceneLoaded+=SceneLoaded;
 }
 void Start(){ReloadSettings();Bind();}
 AudioSource NewSource(string name){var go=new GameObject(name);go.transform.SetParent(transform,false);var s=go.AddComponent<AudioSource>();s.playOnAwake=false;s.spatialBlend=0;s.volume=0;s.priority=100;return s;}
 AudioSource Loop(string key){var s=NewSource(key);s.loop=true;s.clip=Clip(key);s.Play();return s;}
 AudioClip Clip(string key){if(clips.TryGetValue(key,out var c))return c;MissingClips++;Debug.LogError("Missing sound cue: "+key);return null;}
 void SceneLoaded(Scene scene,LoadSceneMode mode){StopWorld();Bind();}
 void Bind(){player=FindAnyObjectByType<WitchPlayer>();torches=FindObjectsByType<TorchGlow>();if(player){lastPosition=player.transform.position;wasGrounded=player.Grounded;}readyPlayed=false;footTravel=0;scanAt=0;}
 public void ReloadSettings(){EffectsVolume=Mathf.Clamp01(PlayerPrefs.GetFloat(Prefix+"EffectsVolume",.8f));AmbientVolume=Mathf.Clamp01(PlayerPrefs.GetFloat(Prefix+"AmbientVolume",.45f));EffectsMuted=PlayerPrefs.GetInt(Prefix+"EffectsMuted",0)==1;AmbientMuted=PlayerPrefs.GetInt(Prefix+"AmbientMuted",0)==1;}
 public void SetVolume(bool ambient,float value){value=Mathf.Clamp01(value);if(ambient)AmbientVolume=value;else EffectsVolume=value;dirty=true;}
 public void SetMuted(bool ambient,bool muted){if(ambient)AmbientMuted=muted;else EffectsMuted=muted;dirty=true;}
 public void SaveSettings(){if(!dirty)return;PlayerPrefs.SetFloat(Prefix+"EffectsVolume",EffectsVolume);PlayerPrefs.SetFloat(Prefix+"AmbientVolume",AmbientVolume);PlayerPrefs.SetInt(Prefix+"EffectsMuted",EffectsMuted?1:0);PlayerPrefs.SetInt(Prefix+"AmbientMuted",AmbientMuted?1:0);PlayerPrefs.Save();dirty=false;}
 public static bool Play(string key,Vector3? at=null,float gain=1,float pitch=1){return Instance&&Instance.Emit(key,at,gain,pitch);}
 public int Count(string key)=>Played.TryGetValue(key,out var n)?n:0;
 bool Emit(string key,Vector3? at,float gain,float pitch){
  bool ui=!at.HasValue||key=="death"||key=="revive"||key=="level_up"||key=="upgrade"||key=="victory"||key=="boss_appear";
  if(!ui&&(Time.timeScale==0||RpgUI.Blocking||!RpgSession.Instance||!RpgSession.Instance.Playing))return false;
  float distance=at.HasValue&&player?ClassCombat.Flat(at.Value-player.transform.position).magnitude:0;if(distance>24&&!ui)return false;
  float gap=key=="ui_error"?.65f:key=="ui_hover"?.12f:key=="heal_tick"?.3f:key.Contains("hit")?.075f:key=="critical"?.14f:.045f;
  float now=Time.unscaledTime;if(last.TryGetValue(key,out var previous)&&now-previous<gap)return false;
  int same=0;Voice free=null;foreach(var v in voices){if(!v.source.isPlaying)free=v;else if(v.key==key)same++;}if(same>=3)return false;
  bool feedback=PlayerCues.Contains(key);int priority=ui?30:key=="boss_warning"||key=="parry"?35:feedback?40:70;
  if(free==null){foreach(var v in voices)if((v.priority>priority||feedback&&v.priority==priority)&&(free==null||v.began<free.began))free=v;if(free==null)return false;}
  var clip=Clip(key);if(!clip)return false;free.source.Stop();free.key=key;free.at=at;free.ui=ui;free.gain=gain;free.began=now;free.priority=priority;free.source.priority=priority;free.source.clip=clip;free.source.ignoreListenerPause=ui;
  free.source.pitch=pitch*(ui?1:Mathf.Lerp(.97f,1.03f,(float)random.NextDouble()));ApplyVoice(free);free.source.Play();last[key]=now;Played[key]=Count(key)+1;
  if(key=="level_up"||key=="victory"||key=="boss_appear"||key=="death")ForestMusic.Instance?.Duck(2.2f);
  return true;
 }
 float FocusGain=>Testing||Application.isFocused?1:0;
 void ApplyVoice(Voice v){float attenuation=1,pan=0;if(v.at.HasValue&&player){var delta=ClassCombat.Flat(v.at.Value-player.transform.position);float d=delta.magnitude;attenuation=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(2,24,d));if(player.viewCamera)pan=Mathf.Clamp(Vector3.Dot(delta,player.viewCamera.transform.right)/12,-.65f,.65f);}v.source.panStereo=pan;v.source.volume=(EffectsMuted?0:EffectsVolume)*v.gain*attenuation*FocusGain*headroom*((Time.timeScale==0||RpgUI.Blocking)&&!v.ui?.35f:1);}
 void FadeLoop(AudioSource s,float target){s.volume=Mathf.MoveTowards(s.volume,target,Time.unscaledDeltaTime*.8f);}
 void Update(){
  if(!player){Bind();if(!player)return;}
  if(player.IsDead&&!wasDead)StopWorld();wasDead=player.IsDead;bool playing=RpgSession.Instance&&RpgSession.Instance.Playing;bool paused=Time.timeScale==0||RpgUI.Blocking;float ambient=(AmbientMuted?0:AmbientVolume)*FocusGain*(playing?(paused?.35f:1):.22f);
  headroom=1/Mathf.Sqrt(Mathf.Max(1,ActiveVoices/6f));foreach(var v in voices)ApplyVoice(v); // Already emitted tails finish quietly; they never replay after resuming.
  if(dirty&&Time.frameCount%30==0)SaveSettings();
  if(Time.unscaledTime>=scanAt){scanAt=Time.unscaledTime+.3f;torchGain=beeGain=burnGain=0;
   if(torches!=null)foreach(var t in torches)if(t)torchGain=Mathf.Max(torchGain,1-Vector3.Distance(player.transform.position,t.transform.position)/7);
   if(playing){foreach(var e in FindObjectsByType<SlimeMonster>())if(e.isBee&&!e.IsDead&&!e.Frozen&&!e.HardStunned)beeGain=Mathf.Max(beeGain,1-Vector3.Distance(player.transform.position,e.transform.position)/6);
    foreach(var m in FindObjectsByType<GrandMeteor>())if(m.Impacted)burnGain=Mathf.Max(burnGain,1-Vector3.Distance(player.transform.position,m.transform.position)/12);}
  }
  FadeLoop(wind,ambient*.36f);FadeLoop(crickets,ambient*.36f);FadeLoop(torch,ambient*Mathf.Clamp01(torchGain)*.7f);
  float effects=(EffectsMuted?0:EffectsVolume)*FocusGain*(playing&&!paused&&!player.IsDead?1:0);
  FadeLoop(bee,effects*Mathf.Clamp01(beeGain)*.38f);FadeLoop(burn,effects*Mathf.Clamp01(burnGain)*.5f);
  bool charging=playing&&player.IsCharging&&!player.IsDead;bool channel=playing&&player.IsChanneling&&!player.IsDead;
  if(charging&&player.Charge01>=.999f)ChargeReady(player);
  string desired=channel?(player.Combat.ClassId==2?"channel_rain":"channel_fire"):charging&&player.Combat.ClassId==0?"charge_loop":null;
  SetPreparationLoop(desired);
  if(effects==0)charge.volume=0;else FadeLoop(charge,desired==null?0:effects*(channel?.33f:Mathf.Lerp(.14f,.38f,player.Charge01)));
  Vector3 now=player.transform.position;float distance=ClassCombat.Flat(now-lastPosition).magnitude;lastPosition=now;
  if(playing&&!paused&&!player.IsDead){
   if(player.Health<player.maxHealth*.25f&&Time.time>=lowHealthAt){Play("low_health",now,.45f);lowHealthAt=Time.time+7;}if(!player.Grounded&&wasGrounded)airSince=Time.time;
   if(player.Grounded&&!wasGrounded&&Time.time-airSince>.15f)Play("land",now,.45f);
   bool locomotion=(player.State=="Walk"||player.State=="Run")&&player.Grounded&&!player.Combat.Evading;
   if(locomotion&&distance<1){footTravel+=distance;float stride=player.State=="Run"?.95f:.63f;if(footTravel>=stride){footTravel%=stride;Play("foot_"+random.Next(3),now,player.State=="Run"?.85f:.65f);}}else footTravel=0;
  }else footTravel=0;wasGrounded=player.Grounded;
 }
 // Player action feedback takes precedence over crowd impacts in the bounded pool.
 static readonly HashSet<string> PlayerCues=new HashSet<string>{"bow_draw","charge_ready","slash","slash_heavy","fan","dash","roll","backstep","blink","jump","land","shield_up","block","bow_release","energy_light","energy_heavy","ice_wave","meteor_fall","meteor_hit","heal_start","heal_tick","trap_set","trap_trigger","rain_start","rain_tick","player_hit","critical"};
 void StopCue(string key){foreach(var v in voices)if(v.key==key)v.source.Stop();}
 void SetPreparationLoop(string key){if(key==chargeKey)return;charge.Stop();charge.volume=0;chargeKey=key;if(key!=null){charge.clip=Clip(key);charge.volume=(EffectsMuted?0:EffectsVolume)*FocusGain*.14f;charge.Play();}}
 public void ChargeStarted(WitchPlayer who){readyPlayed=false;Play(who.Combat.ClassId==2?"bow_draw":"ui_select",who.transform.position,.6f);if(who.Combat.ClassId==0)SetPreparationLoop("charge_loop");}
 public void ChargeReady(WitchPlayer who){if(readyPlayed||!who.IsCharging||who.Charge01<.999f)return;readyPlayed=Play("charge_ready",who.transform.position,.55f);}
 public void ChargeStopped(bool released=false){StopCue("bow_draw");if(!released)StopCue("charge_ready");SetPreparationLoop(null);readyPlayed=false;}
 public void ChannelStarted(WitchPlayer who){SetPreparationLoop(who.Combat.ClassId==2?"channel_rain":"channel_fire");}
 public void ChannelStopped(bool cancelled){SetPreparationLoop(null);if(cancelled)StopCue("meteor_fall");}
 public void StopWorld(){foreach(var v in voices)if(!v.ui){v.source.Stop();}if(charge)charge.Stop();chargeKey=null;}
 void OnApplicationQuit(){SaveSettings();}void OnApplicationFocus(bool focus){if(!focus)SaveSettings();}
 void OnDestroy(){SceneManager.sceneLoaded-=SceneLoaded;if(Instance==this){SaveSettings();Instance=null;}}
}
}
