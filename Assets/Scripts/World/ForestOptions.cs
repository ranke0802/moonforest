using UnityEngine;
using UnityEngine.Rendering;
using System.Collections.Generic;
namespace WitchPlayground {
[DefaultExecutionOrder(-100)]public sealed class ForestOptions:MonoBehaviour {
 public Vector4 campClearing,entranceClearing;
 public bool EnvironmentShadows{get;private set;}=true;
 public float MeasuredFPS{get;private set;}
 readonly Dictionary<Renderer,ShadowCastingMode> original=new Dictionary<Renderer,ShadowCastingMode>();float elapsed;int frames;
 void Awake(){ApplyFrameLimit();Shader.SetGlobalVector("_CampClearing",campClearing);Shader.SetGlobalVector("_EntranceClearing",entranceClearing);}
 void Start(){
  foreach(var r in FindObjectsByType<Renderer>()){
   if(r.GetComponentInParent<WitchPlayer>()||r.GetComponentInParent<SlimeMonster>())continue;
   var interaction=r.GetComponentInParent<ForestInteractable>();if(interaction&&interaction.kind==ForestInteractable.Kind.NPC)continue;
   original[r]=r.shadowCastingMode;
  }
  SetEnvironmentShadows(PlayerPrefs.GetInt("Forest.EnvironmentShadows",1)!=0);if(RpgSession.Instance&&!RpgSession.Instance.Testing&&PlayerPrefs.HasKey("WitchRPG.Width"))Screen.SetResolution(Mathf.Clamp(PlayerPrefs.GetInt("WitchRPG.Width"),960,3840),Mathf.Clamp(PlayerPrefs.GetInt("WitchRPG.Height"),640,2160),FullScreenMode.Windowed);
 }
 public void ApplyFrameLimit(){QualitySettings.vSyncCount=0;Application.targetFrameRate=60;}
 void OnApplicationFocus(bool focused){if(focused)ApplyFrameLimit();}
 void Update(){
  if(Input.GetKeyDown(KeyCode.Alpha1)||Input.GetKeyDown(KeyCode.Keypad1)){SetEnvironmentShadows(!EnvironmentShadows);if(RpgSession.Instance&&!RpgSession.Instance.Testing)RpgSession.Instance.SaveSettings();}
  elapsed+=Time.unscaledDeltaTime;frames++;if(elapsed>=.5f){MeasuredFPS=frames/elapsed;elapsed=0;frames=0;}
 }
 public void SetEnvironmentShadows(bool enabled){EnvironmentShadows=enabled;foreach(var pair in original)if(pair.Key)pair.Key.shadowCastingMode=enabled?pair.Value:ShadowCastingMode.Off;}
 public int ManagedRendererCount=>original.Count;
}
}
