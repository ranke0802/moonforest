using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed class HeroRoster:MonoBehaviour {
 public GameObject[] models;public Animator[] animators;public int Selected;public Camera previewCamera;public RenderTexture preview;
 public float PreviewYaw{get;private set;}public float PreviewPitch{get;private set;}=5.89f;
 Rect previewRect;bool previewAllowed,previewDragging;Vector2 previewLastMouse;
 public void ResetPreviewView(){PreviewYaw=0;PreviewPitch=5.89f;previewDragging=false;}
 public void PreviewInput(Rect rect,bool enabled){previewRect=rect;previewAllowed=enabled;if(!enabled)previewDragging=false;if(enabled&&Event.current!=null&&rect.Contains(Event.current.mousePosition)&&Event.current.type==EventType.ScrollWheel)Event.current.Use();}
 public void PollPreview(Vector2 pointer,bool pressed,bool held){
  bool allowed=previewAllowed&&RpgSession.Instance&&RpgSession.Instance.Creating&&!RpgSession.Instance.Playing&&RpgUI.Instance.ActiveWindow==RpgUI.Window.None;
  if(!allowed||!held){previewDragging=false;return;}
  if(pressed&&previewRect.Contains(pointer)){previewDragging=true;previewLastMouse=pointer;}
  if(!previewDragging)return;Vector2 delta=pointer-previewLastMouse;previewLastMouse=pointer;
  PreviewYaw=Mathf.Repeat(PreviewYaw-delta.x/previewRect.width*180+180,360)-180;
  PreviewPitch=Mathf.Clamp(PreviewPitch+delta.y/previewRect.height*100,-20,35);
 }
 void Update(){var player=GetComponent<WitchPlayer>();if(player.TestControl)return;float scale=Mathf.Min(Screen.width/1280f,Screen.height/800f);PollPreview(new Vector2(Input.mousePosition.x,(Screen.height-Input.mousePosition.y))/scale,Input.GetMouseButtonDown(0),Input.GetMouseButton(0));}
 void OnApplicationFocus(bool focused){if(!focused)previewDragging=false;}
 public string ClassName(int i)=>i==0?Loc.T("마녀","Witch","魔女"):i==1?Loc.T("전사","Warrior","戦士"):Loc.T("궁수","Archer","弓使い");
 public string WeaponName=>Selected==0?Loc.T("별빛 마법서","Starlit Spellbook","星明かりの魔導書"):Selected==1?Loc.T("토끼 문장 검과 방패","Bunny Sword & Shield","兎の剣と盾"):Loc.T("푸른 별의 활","Azure Bow","蒼星の弓");
 void Start(){Select(0);var go=new GameObject("Character portrait camera");previewCamera=go.AddComponent<Camera>();previewCamera.enabled=false;previewCamera.clearFlags=CameraClearFlags.SolidColor;previewCamera.backgroundColor=new Color(.10f,.06f,.16f);previewCamera.cullingMask=1<<8;previewCamera.orthographic=true;previewCamera.orthographicSize=1.08f;preview=new RenderTexture(512,640,24);previewCamera.targetTexture=preview;}
 public void Select(int i){ResetPreviewView();if(RpgSession.Instance&&!RpgSession.Instance.Playing&&i!=Selected)ForestSound.Play("ui_select",null,.6f);GetComponent<WitchPlayer>().Combat?.ResetCombat();GetComponent<WitchPlayer>().CancelCharge();Selected=Mathf.Clamp(i,0,2);for(int k=0;k<models.Length;k++)if(models[k])models[k].SetActive(k==Selected);var p=GetComponent<WitchPlayer>();p.animator=animators[Selected];p.animator.applyRootMotion=false;p.animator.updateMode=AnimatorUpdateMode.UnscaledTime;GetComponent<RpgProgress>().RefreshStats();PlayIntro();}
 public void PlayIntro(){var a=GetComponent<WitchPlayer>().animator;if(a){a.CrossFadeInFixedTime(Selected==0?"Cast":"Intro",.15f);}}
 void OnDestroy(){if(previewCamera)Destroy(previewCamera.gameObject);if(preview){preview.Release();Destroy(preview);}}
 void LateUpdate(){bool menu=RpgSession.Instance&&!RpgSession.Instance.Playing;var p=GetComponent<WitchPlayer>();if(p.animator)p.animator.updateMode=menu?AnimatorUpdateMode.UnscaledTime:AnimatorUpdateMode.Normal;if(menu&&previewCamera){Vector3 pivot=transform.position+Vector3.up*.82f;var orbit=Quaternion.AngleAxis(PreviewYaw,Vector3.up)*Quaternion.AngleAxis(-PreviewPitch,transform.right)*transform.forward;previewCamera.orthographicSize=1.08f;previewCamera.transform.position=pivot+orbit*3.217f;previewCamera.transform.LookAt(pivot);previewCamera.Render();}}
}
}
