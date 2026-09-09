using UnityEngine;
namespace WitchPlayground {
public sealed partial class RpgUI {
 string submittedName;string visibleName;
 public static string ComposeName(string text,string composition,int cursor,int selection){text=text??"";if(string.IsNullOrEmpty(composition))return text;int start=Mathf.Clamp(Mathf.Min(cursor,selection),0,text.Length),end=Mathf.Clamp(Mathf.Max(cursor,selection),start,text.Length);return text.Remove(start,end-start).Insert(start,composition);}
 void DrawNameEntry(Rect rect,Rect submit,GUIStyle style){
  // Snapshot before focus loss: IMGUI's text value excludes the active Korean/Japanese composition.
  if(Event.current.type==EventType.MouseDown&&submit.Contains(Event.current.mousePosition))submittedName=visibleName??entered;
  GUI.SetNextControlName("character_name");entered=GUI.TextField(rect,entered,12,style);
  if(GUI.GetNameOfFocusedControl()=="character_name"){
   var editor=(TextEditor)GUIUtility.GetStateObject(typeof(TextEditor),GUIUtility.keyboardControl);
   visibleName=ComposeName(entered,Input.compositionString,editor.cursorIndex,editor.selectIndex);
   Input.compositionCursorPos=new Vector2(rect.x*scale,(rect.yMax)*scale);
  }else if(string.IsNullOrEmpty(Input.compositionString)&&submittedName==null)visibleName=entered;
 }
 string ConfirmedName(){string name=submittedName??visibleName??entered;submittedName=null;entered=name;GUI.FocusControl(null);Input.imeCompositionMode=IMECompositionMode.Off;return name;}
}
}
