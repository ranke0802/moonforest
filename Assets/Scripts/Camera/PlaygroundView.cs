using UnityEngine;
using System;
namespace WitchPlayground {
public sealed class PlaygroundView:MonoBehaviour {
 public WitchPlayer player;public PracticeDummy[] dummies;public float yaw=145,pitch=32,distance=14,focusHeight=.6f,followSpeed=10,rotationSensitivity=3,zoomStep=.28f;Camera cam;Vector3 focus;float shakeUntil,shakeSize;
 public static bool ShiftHeld=>Input.GetKey(KeyCode.LeftShift)||Input.GetKey(KeyCode.RightShift);
 public static bool IsOrbitGesture=>Input.GetMouseButton(2)||(ShiftHeld&&Input.GetMouseButton(1));
 [Serializable]public class Settings {public float yaw=145,pitch=32,distance=14,zoom=4.8f,height=.6f,follow=10,sensitivity=3,zoomStep=.28f,fov=48;public bool orthographic=true;}
 public Settings Capture()=>new Settings{yaw=yaw,pitch=pitch,distance=distance,zoom=CameraComponent.orthographicSize,height=focusHeight,follow=followSpeed,sensitivity=rotationSensitivity,zoomStep=zoomStep,fov=CameraComponent.fieldOfView,orthographic=CameraComponent.orthographic};
 Camera CameraComponent{get{if(!cam)cam=GetComponent<Camera>();return cam;}}
 public void Apply(Settings d){yaw=d.yaw;pitch=Mathf.Clamp(d.pitch,10,80);distance=Mathf.Clamp(d.distance,3,35);focusHeight=d.height;followSpeed=d.follow;rotationSensitivity=d.sensitivity;zoomStep=d.zoomStep;CameraComponent.orthographic=d.orthographic;cam.orthographicSize=Mathf.Clamp(d.zoom,2,12);cam.fieldOfView=Mathf.Clamp(d.fov,25,85);}
 void Start(){ResetPracticeCamera();if(!RpgProgress.Instance.TestSession&&PlayerPrefs.GetInt("WitchRPG.CameraVersion",0)>=41){yaw=PlayerPrefs.GetFloat("WitchRPG.CameraYaw",145);pitch=PlayerPrefs.GetFloat("WitchRPG.CameraPitch",32);cam.orthographicSize=PlayerPrefs.GetFloat("WitchRPG.CameraZoom",4.8f);}}
 public void ResetPracticeCamera(){var d=new Settings();if(RpgProgress.Instance&&!RpgProgress.Instance.TestSession&&PlayerPrefs.HasKey("WitchRPG.BackView.v41"))d=JsonUtility.FromJson<Settings>(PlayerPrefs.GetString("WitchRPG.BackView.v41"));Apply(d);Snap();}
 public void FactoryCamera(){Apply(new Settings());Snap();}
 public void SaveBackView(){if(!RpgProgress.Instance.TestSession){PlayerPrefs.SetString("WitchRPG.BackView.v41",JsonUtility.ToJson(Capture()));PlayerPrefs.Save();}}
 public void Snap(){focus=player.transform.position+Vector3.up*focusHeight;transform.rotation=Quaternion.Euler(pitch,yaw,0);transform.position=focus-transform.forward*distance;}
 public void Orbit(float x,float y){yaw=Mathf.Repeat(yaw+x*rotationSensitivity,360);pitch=Mathf.Clamp(pitch-y*rotationSensitivity,10,80);}
 public void Shake(float seconds,float size){shakeUntil=Time.time+seconds;shakeSize=size;}
 void LateUpdate(){if(!RpgUI.Blocking&&!DeveloperPanel.PointerOver){if(Input.GetKeyDown(KeyCode.C))ResetPracticeCamera();if(IsOrbitGesture)Orbit(Input.GetAxis("Mouse X"),Input.GetAxis("Mouse Y"));float scroll=Input.mouseScrollDelta.y;if(cam.orthographic)cam.orthographicSize=Mathf.Clamp(cam.orthographicSize-scroll*zoomStep,2,12);else distance=Mathf.Clamp(distance-scroll*zoomStep*2,3,35);}focus=Vector3.Lerp(focus,player.transform.position+Vector3.up*focusHeight,1-Mathf.Exp(-followSpeed*Time.unscaledDeltaTime));transform.rotation=Quaternion.Euler(pitch,yaw,0);transform.position=focus-transform.forward*distance;if(Time.time<shakeUntil)transform.position+=UnityEngine.Random.insideUnitSphere*shakeSize;Shader.SetGlobalVector("_WitchPosition",player.transform.position);Shader.SetGlobalVector("_ForestCamera",transform.position);}
}
}
