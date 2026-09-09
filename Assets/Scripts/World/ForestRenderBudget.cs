using UnityEngine;
namespace WitchPlayground {
// Keep UI and pointer coordinates at window resolution; bound only the expensive forest render.
[RequireComponent(typeof(Camera))] public sealed class ForestRenderBudget:MonoBehaviour {
 Camera output,world;RenderTexture texture;int mask;CameraClearFlags clear;bool delegated;
 public int RenderWidth=>texture?texture.width:Screen.width;
 public int RenderHeight=>texture?texture.height:Screen.height;
 void Awake(){output=GetComponent<Camera>();}
 void OnPreCull(){
  float scale=Mathf.Min(1,Mathf.Min(1600f/Screen.width,1000f/Screen.height));
  if(scale>=.999f)return;
  int width=Mathf.Max(1,Mathf.RoundToInt(Screen.width*scale)),height=Mathf.Max(1,Mathf.RoundToInt(Screen.height*scale));
  if(!world){world=new GameObject("Bounded forest rendering").AddComponent<Camera>();world.enabled=false;}
  if(!texture||texture.width!=width||texture.height!=height){Release();texture=new RenderTexture(width,height,24,RenderTextureFormat.DefaultHDR){name="Forest render budget",filterMode=FilterMode.Bilinear};texture.Create();}
  world.CopyFrom(output);world.enabled=false;world.transform.SetPositionAndRotation(output.transform.position,output.transform.rotation);world.targetTexture=texture;world.rect=new Rect(0,0,1,1);world.Render();
  mask=output.cullingMask;clear=output.clearFlags;output.cullingMask=0;output.clearFlags=CameraClearFlags.Nothing;delegated=true;
 }
 void OnRenderImage(RenderTexture source,RenderTexture destination){Graphics.Blit(delegated&&texture?texture:source,destination);Restore();}
 void Restore(){if(!delegated)return;output.cullingMask=mask;output.clearFlags=clear;delegated=false;}
 void Release(){if(texture){texture.Release();Destroy(texture);texture=null;}}
 void OnDisable(){Restore();Release();if(world){Destroy(world.gameObject);world=null;}}
}
}
