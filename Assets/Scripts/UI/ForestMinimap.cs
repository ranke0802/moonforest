using UnityEngine;
namespace WitchPlayground {
public sealed class ForestMinimap:MonoBehaviour {
 public RenderTexture Texture;Camera map;float next;void Start(){map=new GameObject("Minimap terrain camera").AddComponent<Camera>();map.enabled=false;map.orthographic=true;map.orthographicSize=12;map.clearFlags=CameraClearFlags.SolidColor;map.backgroundColor=new Color(.075f,.12f,.12f);map.cullingMask=(1<<0)|(1<<10)|(1<<11);map.nearClipPlane=.1f;map.farClipPlane=100;Texture=new RenderTexture(256,256,16);map.targetTexture=Texture;}
 void LateUpdate(){if(!RpgSession.Instance.Playing||Time.unscaledTime<next)return;next=Time.unscaledTime+.25f;map.transform.SetPositionAndRotation(transform.position+Vector3.up*55,Quaternion.Euler(90,Camera.main.transform.eulerAngles.y,0));map.Render();}
}
}
