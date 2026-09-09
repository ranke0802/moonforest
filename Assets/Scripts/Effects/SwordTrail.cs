using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
namespace WitchPlayground {
// Sample after animation and foot grounding. Stored world poses must not follow the lunging root.
[DefaultExecutionOrder(120)]
public sealed class SwordTrail : MonoBehaviour {
 struct Sample { public Vector3 root,tip; public float time; }
 readonly List<Sample> samples=new List<Sample>(32);
 readonly List<Vector3> vertices=new List<Vector3>(64);
 readonly List<Vector2> uvs=new List<Vector2>(64);
 readonly List<Color> colors=new List<Color>(64);
 readonly List<int> triangles=new List<int>(180);
 WitchPlayer player; Transform wrist; Vector3 localTip; Animator boundAnimator;
 GameObject ribbon; Mesh mesh; MeshRenderer render; Material material;
 float began,start,end,life; bool active,critical;
 public bool Emitting {get;private set;}
 public int SampleCount=>samples.Count;
 public Vector3 Tip=>wrist?wrist.TransformPoint(localTip):transform.position;
 public Vector3 BladeRoot=>wrist?Vector3.Lerp(wrist.position,Tip,.2f):transform.position;
 public Vector3 LastTip=>samples.Count>0?samples[samples.Count-1].tip:Tip;
 public int BoundVertex {get;private set;}=-1;
 public SkinnedMeshRenderer BoundSkin {get;private set;}
 public bool Visible=>render&&render.enabled;
 public static SwordTrail Begin(WitchPlayer owner,bool crit){
  var trail=owner.GetComponent<SwordTrail>();if(!trail)trail=owner.gameObject.AddComponent<SwordTrail>();
  trail.player=owner;trail.Stop();if(!trail.BindBlade())return trail;
  trail.EnsureMesh();trail.ribbon.transform.position=owner.transform.position;
  trail.critical=crit;trail.began=Time.time;trail.start=crit?.29f:.16f;trail.end=crit?.54f:.39f;trail.life=crit?.14f:.12f;trail.active=true;
  return trail;
 }
 bool BindBlade(){
  if(boundAnimator==player.animator&&wrist)return true;
  boundAnimator=player.animator;wrist=null;BoundSkin=null;BoundVertex=-1;float far=0;
  if(!boundAnimator)return false;
  var baked=new Mesh();
  foreach(var skin in boundAnimator.GetComponentsInChildren<SkinnedMeshRenderer>()){
   int index=Array.FindIndex(skin.bones,b=>b&&b.name=="Wrist.R");if(index<0)continue;
   skin.BakeMesh(baked,true);var points=baked.vertices;var weights=skin.sharedMesh.boneWeights;
   for(int i=0;i<points.Length;i++){
    var weight=weights[i];if(weight.boneIndex0!=index||weight.weight0<.999f)continue;
    Vector3 point=skin.transform.TransformPoint(points[i]);float distance=(point-skin.bones[index].position).sqrMagnitude;
    if(distance<=far)continue;far=distance;wrist=skin.bones[index];localTip=wrist.InverseTransformPoint(point);BoundSkin=skin;BoundVertex=i;
   }
  }
  Destroy(baked);return wrist&&far>.01f;
 }
 void EnsureMesh(){
  if(ribbon)return;
  ribbon=new GameObject("Sword blade trail");ribbon.layer=9;
  mesh=new Mesh{name="World sampled sword sweep"};mesh.MarkDynamic();ribbon.AddComponent<MeshFilter>().sharedMesh=mesh;
  render=ribbon.AddComponent<MeshRenderer>();render.shadowCastingMode=ShadowCastingMode.Off;render.receiveShadows=false;
  var shader=Resources.Load<Shader>("RPG/SwordTrail");material=new Material(shader);
  var paint=Resources.Load<Material>("RPG/WarriorPaint");if(paint)material.mainTexture=paint.mainTexture;
  render.sharedMaterial=material;render.enabled=false;
 }
 void LateUpdate(){
  if(!active)return;
  if(!player||player.IsDead||player.animator!=boundAnimator||!wrist){Stop();return;}
  if(Time.deltaTime<=0||RpgUI.Blocking)return;
  float elapsed=Time.time-began;
  Emitting=elapsed>=start&&elapsed<=end&&player.IsSpellCasting&&player.ActionName.StartsWith("Slash",StringComparison.Ordinal);
  while(samples.Count>0&&Time.time-samples[0].time>life)samples.RemoveAt(0);
  if(Emitting){
   Vector3 tip=Tip,root=BladeRoot;
   // A teleport or model replacement must never draw a strip across the map.
   if(samples.Count>0&&Vector3.Distance(tip,LastTip)>1.5f)samples.Clear();
   samples.Add(new Sample{root=root,tip=tip,time=Time.time});
  }
  Draw();if(elapsed>end+life)Stop();
 }
 void Draw(){
  render.enabled=samples.Count>=2;if(!render.enabled)return;
  vertices.Clear();uvs.Clear();colors.Clear();triangles.Clear();Vector3 origin=ribbon.transform.position;
  Color tint=critical?new Color(1,.76f,.34f,1):new Color(.73f,.86f,1,1);
  for(int i=0;i<samples.Count;i++){
   var s=samples[i];vertices.Add(s.root-origin);vertices.Add(s.tip-origin);
   float t=(s.time-began-start)/(end-start);uvs.Add(new Vector2(t,0));uvs.Add(new Vector2(t,1));
   tint.a=Mathf.Pow(Mathf.Clamp01(1-(Time.time-s.time)/life),1.4f)*.72f;colors.Add(tint);colors.Add(tint);
   if(i==0)continue;int n=i*2;triangles.Add(n-2);triangles.Add(n-1);triangles.Add(n);triangles.Add(n);triangles.Add(n-1);triangles.Add(n+1);
  }
  mesh.Clear();mesh.SetVertices(vertices);mesh.SetUVs(0,uvs);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);mesh.RecalculateBounds();
 }
 public void Stop(){active=false;Emitting=false;samples.Clear();if(render)render.enabled=false;if(mesh)mesh.Clear();}
 void OnDisable(){Stop();}
 void OnDestroy(){if(ribbon)Destroy(ribbon);if(mesh)Destroy(mesh);if(material)Destroy(material);}
}
}
