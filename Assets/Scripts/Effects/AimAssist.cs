using UnityEngine;
namespace WitchPlayground {
// A small ground marker communicates the enemy a keyboard basic attack would use.
[DefaultExecutionOrder(90)] public sealed class AimAssist:MonoBehaviour {
 WitchPlayer player;LineRenderer ring;Material material;float next;public SlimeMonster Target{get;private set;}
 void Awake(){player=GetComponent<WitchPlayer>();var go=new GameObject("Keyboard aim marker");go.transform.SetParent(transform,false);ring=go.AddComponent<LineRenderer>();material=new Material(Shader.Find("Sprites/Default"));ring.sharedMaterial=material;ring.positionCount=49;ring.startWidth=ring.endWidth=.035f;ring.startColor=ring.endColor=new Color(1,.85f,.25f,.85f);ring.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;ring.receiveShadows=false;ring.enabled=false;}
 void LateUpdate(){if(Time.unscaledTime>=next){next=Time.unscaledTime+.1f;Target=null;if(!player.IsDead&&!RpgUI.Blocking&&(!player.IsCharging||!player.ChargeUsesMouse))Target=player.Combat.ClassId==1?player.Combat.SwordTarget():player.Combat.ClassId==0?player.WitchAutoTarget():player.Combat.AimedBowTarget;}
  bool visible=Target&&!Target.IsDead&&!player.IsDead&&!RpgUI.Blocking;ring.enabled=visible;Shader.SetGlobalVector("_AimTarget",visible?new Vector4(Target.transform.position.x,Target.transform.position.y,Target.transform.position.z,1):Vector4.zero);if(!visible)return;float radius=Target.isBoss?1.2f:.55f;for(int i=0;i<49;i++){float angle=i*Mathf.PI/24;ring.SetPosition(i,GroundSpellTravel.GroundPosition(Target.transform.position+new Vector3(Mathf.Cos(angle),0,Mathf.Sin(angle))*radius,.075f));}}
 void OnDestroy(){if(material)Destroy(material);Shader.SetGlobalVector("_AimTarget",Vector4.zero);}
}
}
