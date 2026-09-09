using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed class HeroRoster:MonoBehaviour {
 public GameObject[] models;public Animator[] animators;public int Selected;public Camera previewCamera;public RenderTexture preview;
 float previewYaw,previewPitch=5.89f;int previewControl;Vector2 previewLastMouse;bool cancelPreviewDrag;
 public void ResetPreviewView(){previewYaw=0;previewPitch=5.89f;cancelPreviewDrag=true;}
 // Own the pointer until release, including when it leaves the portrait rectangle.
 public void PreviewInput(Rect rect,bool enabled){
  int id=GUIUtility.GetControlID(414041,FocusType.Passive,rect);var e=Event.current;
  if(cancelPreviewDrag||!enabled){if(previewControl!=0&&GUIUtility.hotControl==previewControl)GUIUtility.hotControl=0;previewControl=0;cancelPreviewDrag=false;}
  if(!enabled)return;
  switch(e.GetTypeForControl(id)){
   case EventType.MouseDown:
    if(e.button==0&&rect.Contains(e.mousePosition)){GUIUtility.hotControl=id;GUIUtility.keyboardControl=0;previewControl=id;previewLastMouse=e.mousePosition;e.Use();}break;
   case EventType.MouseDrag:
    if(GUIUtility.hotControl==id&&e.button==0){Vector2 delta=e.mousePosition-previewLastMouse;previewLastMouse=e.mousePosition;previewYaw=Mathf.Repeat(previewYaw-delta.x/rect.width*180+180,360)-180;previewPitch=Mathf.Clamp(previewPitch+delta.y/rect.height*100,-20,35);e.Use();}break;
   case EventType.MouseUp:
    if(GUIUtility.hotControl==id&&e.button==0){GUIUtility.hotControl=0;previewControl=0;e.Use();}break;
   case EventType.ScrollWheel:
    if(rect.Contains(e.mousePosition))e.Use();break;
  }
 }
 void OnApplicationFocus(bool focused){if(!focused)cancelPreviewDrag=true;}
 public string ClassName(int i)=>i==0?Loc.T("마녀","Witch","魔女"):i==1?Loc.T("전사","Warrior","戦士"):Loc.T("궁수","Archer","弓使い");
 public string WeaponName=>Selected==0?Loc.T("별빛 마법서","Starlit Spellbook","星明かりの魔導書"):Selected==1?Loc.T("토끼 문장 검과 방패","Bunny Sword & Shield","兎の剣と盾"):Loc.T("푸른 별의 활","Azure Bow","蒼星の弓");
 void Start(){Select(0);var go=new GameObject("Character portrait camera");previewCamera=go.AddComponent<Camera>();previewCamera.enabled=false;previewCamera.clearFlags=CameraClearFlags.SolidColor;previewCamera.backgroundColor=new Color(.10f,.06f,.16f);previewCamera.cullingMask=1<<8;previewCamera.orthographic=true;previewCamera.orthographicSize=1.08f;preview=new RenderTexture(512,640,24);previewCamera.targetTexture=preview;}
 public void Select(int i){ResetPreviewView();if(RpgSession.Instance&&!RpgSession.Instance.Playing&&i!=Selected)ForestSound.Play("ui_select",null,.6f);GetComponent<WitchPlayer>().Combat?.ResetCombat();GetComponent<WitchPlayer>().CancelCharge();Selected=Mathf.Clamp(i,0,2);for(int k=0;k<models.Length;k++)if(models[k])models[k].SetActive(k==Selected);var p=GetComponent<WitchPlayer>();p.animator=animators[Selected];p.animator.applyRootMotion=false;p.animator.updateMode=AnimatorUpdateMode.UnscaledTime;GetComponent<RpgProgress>().RefreshStats();PlayIntro();}
 public void PlayIntro(){var a=GetComponent<WitchPlayer>().animator;if(a){a.CrossFadeInFixedTime(Selected==0?"Cast":"Intro",.15f);}}
 void LateUpdate(){bool menu=RpgSession.Instance&&!RpgSession.Instance.Playing;var p=GetComponent<WitchPlayer>();if(p.animator)p.animator.updateMode=menu?AnimatorUpdateMode.UnscaledTime:AnimatorUpdateMode.Normal;if(menu&&previewCamera){Vector3 pivot=transform.position+Vector3.up*.82f;var orbit=Quaternion.AngleAxis(previewYaw,Vector3.up)*Quaternion.AngleAxis(-previewPitch,transform.right)*transform.forward;previewCamera.orthographicSize=1.08f;previewCamera.transform.position=pivot+orbit*3.217f;previewCamera.transform.LookAt(pivot);previewCamera.Render();}}
}
}
