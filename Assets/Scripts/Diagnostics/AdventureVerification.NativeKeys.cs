using UnityEngine;
using System;
using System.IO;
using System.Linq;
using System.Collections;
namespace WitchPlayground {
public sealed partial class AdventureVerification {
 IEnumerator NativeKeys(){
  a.TestFreezeEnemies=true;a.ApplyWorld();p.Teleport(a.Camp);p.ProtectArrival();p.TestControl=false;stats.ranks=new[]{1,1,1,1};ClearUI();Camera.main.GetComponent<PlaygroundView>().Snap();
  Debug.Log("NATIVE_READY");float end=Time.realtimeSinceStartup+40;
  while(Time.realtimeSinceStartup<end){stats.RestoreMana();foreach(var key in new[]{KeyCode.C,KeyCode.B,KeyCode.V,KeyCode.Z,KeyCode.U,KeyCode.I,KeyCode.K,KeyCode.J})if(Input.GetKeyDown(key))Debug.Log("NATIVE_KEY "+key+" window="+RpgUI.Instance.ActiveWindow+" charge="+p.IsCharging+" channel="+p.IsChanneling);yield return null;}
  Check(Input.imeCompositionMode==IMECompositionMode.Off,"Gameplay disables IME composition");Check(p.ShotsFired>0,"Physical J press and release fires a witch energy ball");yield return Shot("native-keys");Finish(null);
 }
}
}
