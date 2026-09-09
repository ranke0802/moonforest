using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using System.Linq;
using System.Collections.Generic;
using System.IO;
public static class ForestTreeBake {
 public static void Bake(){
  EditorSceneManager.OpenScene("Assets/Scenes/MoonlitForest.unity");Directory.CreateDirectory("Assets/Art/Forest/TreeVisibility");
  var filters=Object.FindObjectsByType<MeshFilter>(FindObjectsInactive.Include,FindObjectsSortMode.None);
  var trunks=filters.Where(f=>f.name.StartsWith("Collision_Trunk_")).Select(f=>f.transform.TransformPoint(f.sharedMesh.bounds.center)).ToArray();
  if(trunks.Length<10)throw new System.Exception("Tree anchors missing: "+trunks.Length);
  foreach(var f in filters.Where(f=>f.name.StartsWith("Vegetation_"))){var src=f.sharedMesh;var mesh=Object.Instantiate(src);mesh.name=f.name+" visibility";var vertices=mesh.vertices;var parents=Enumerable.Range(0,vertices.Length).ToArray();
   System.Func<int,int> root=null;root=i=>{while(parents[i]!=i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
   var triangles=mesh.triangles;for(int i=0;i<triangles.Length;i+=3){int a=root(triangles[i]);parents[root(triangles[i+1])]=a;parents[root(triangles[i+2])]=a;}
   var centers=new Dictionary<int,Vector3>();var counts=new Dictionary<int,int>();for(int i=0;i<vertices.Length;i++){int k=root(i);Vector3 world=f.transform.TransformPoint(vertices[i]);if(!centers.ContainsKey(k)){centers[k]=Vector3.zero;counts[k]=0;}centers[k]+=world;counts[k]++;}
   var ids=new Dictionary<int,int>();foreach(var pair in centers){Vector3 c=pair.Value/counts[pair.Key];float best=float.MaxValue;int chosen=0;for(int j=0;j<trunks.Length;j++){float d=new Vector2(c.x-trunks[j].x,c.z-trunks[j].z).sqrMagnitude;if(d<best){best=d;chosen=j;}}ids[pair.Key]=chosen;}
   var min=new float[trunks.Length];var max=new float[trunks.Length];for(int i=0;i<trunks.Length;i++){min[i]=float.MaxValue;max[i]=float.MinValue;}
   for(int i=0;i<vertices.Length;i++){int id=ids[root(i)];float y=f.transform.TransformPoint(vertices[i]).y;min[id]=Mathf.Min(min[id],y);max[id]=Mathf.Max(max[id],y);}
   var anchors=new List<Vector4>(vertices.Length);for(int i=0;i<vertices.Length;i++){int id=ids[root(i)];Vector3 t=trunks[id];anchors.Add(new Vector4(t.x,min[id],t.z,Mathf.Max(1,max[id]-min[id])));}mesh.SetUVs(3,anchors);
   string path="Assets/Art/Forest/TreeVisibility/"+f.name+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);if(existing){EditorUtility.CopySerialized(mesh,existing);Object.DestroyImmediate(mesh);mesh=existing;}else AssetDatabase.CreateAsset(mesh,path);f.sharedMesh=mesh;
  }
  EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene());AssetDatabase.SaveAssets();Debug.Log("TREE_ANCHORS_BAKED "+trunks.Length);ForestSetup.Deliver();
 }
}
