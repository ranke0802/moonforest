using UnityEngine;using UnityEditor;using UnityEditor.Animations;using UnityEditor.SceneManagement;using System.Linq;using System.IO;using System.Collections.Generic;using WitchPlayground;
public static class MotionSetup {
 public static void Run(){EditorSceneManager.OpenScene("Assets/Scenes/MoonlitForest.unity");var p=Object.FindAnyObjectByType<WitchPlayer>();var roster=p.GetComponent<HeroRoster>();var report=new List<string>();
 foreach(var anim in roster.animators){var ac=(AnimatorController)anim.runtimeAnimatorController;if(!ac.parameters.Any(x=>x.name=="MoveRate"))ac.AddParameter("MoveRate",AnimatorControllerParameterType.Float);foreach(var child in ac.layers[0].stateMachine.states)if(child.state.name=="Walk"||child.state.name=="Run"){child.state.speedParameter="MoveRate";child.state.speedParameterActive=true;}EditorUtility.SetDirty(ac);report.Add(anim.name+" clips: "+string.Join(",",ac.layers[0].stateMachine.states.Select(s=>s.state.name)));report.Add("Feet: "+string.Join(",",anim.GetComponentsInChildren<Transform>(true).Where(t=>t.name.ToLower().Contains("foot")).Select(t=>t.name)));}
 var cc=p.GetComponent<CharacterController>();report.Add("Player capsule radius="+cc.radius+" step="+cc.stepOffset+" skin="+cc.skinWidth);cc.skinWidth=.025f;cc.stepOffset=.25f;
 // The single imported collision mesh around a whole rock catches on small surface facets.
 // Retain authored solid geometry; the capsule step and skin handle small seams without wall bypass.
 foreach(var c in Object.FindObjectsByType<Collider>())if(c.GetComponentInParent<ForestInteractable>())report.Add(c.name+" collider "+c.GetType().Name+" bounds="+c.bounds.size);
 AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());Directory.CreateDirectory("Verification");File.WriteAllLines("Verification/motion-audit.txt",report);Debug.Log("MOTION_SETUP_OK");}
}
