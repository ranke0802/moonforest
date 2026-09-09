using UnityEngine;
namespace WitchPlayground {
public sealed class StatusVisuals:MonoBehaviour {
 SlimeMonster monster;GameObject ice,roots;static Material frost,vine;static Mesh crystal;
 public bool IceVisible=>ice&&ice.activeSelf;public bool RootsVisible=>roots&&roots.activeSelf;
 void Awake(){monster=GetComponent<SlimeMonster>();if(!frost){frost=new Material(Shader.Find("Standard")){color=new Color(.22f,.8f,.95f)};frost.EnableKeyword("_EMISSION");frost.SetColor("_EmissionColor",new Color(.05f,.35f,.5f));vine=new Material(Shader.Find("Sprites/Default")){color=new Color(.46f,.8f,.24f)};crystal=new Mesh();crystal.vertices=new[]{new Vector3(0,1,0),new Vector3(-.5f,0,0),new Vector3(0,0,.5f),new Vector3(.5f,0,0),new Vector3(0,0,-.5f),new Vector3(0,-.25f,0)};crystal.triangles=new[]{0,2,1,0,3,2,0,4,3,0,1,4,5,1,2,5,2,3,5,3,4,5,4,1};crystal.RecalculateNormals();}
 ice=new GameObject("Frozen ice crystals");ice.transform.SetParent(transform,false);roots=new GameObject("Root binding vines");roots.transform.SetParent(transform,false);float size=monster.isBoss?1.8f:1;
 for(int i=0;i<6;i++){float a=i*Mathf.PI/3;var part=new GameObject("Ice shard");part.transform.SetParent(ice.transform,false);part.transform.localPosition=new Vector3(Mathf.Cos(a)*.4f,.12f,Mathf.Sin(a)*.4f)*size;part.transform.localRotation=Quaternion.Euler(Mathf.Sin(a)*20,0,Mathf.Cos(a)*-20);part.transform.localScale=new Vector3(.3f,.65f+(i%2)*.18f,.3f)*size;part.AddComponent<MeshFilter>().sharedMesh=crystal;var r=part.AddComponent<MeshRenderer>();r.sharedMaterial=frost;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;}
 for(int k=0;k<2;k++){var part=new GameObject("Binding vine");part.transform.SetParent(roots.transform,false);var l=part.AddComponent<LineRenderer>();l.sharedMaterial=vine;l.useWorldSpace=false;l.startWidth=l.endWidth=.045f*size;l.positionCount=49;l.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;for(int i=0;i<49;i++){float t=i/48f,a=t*Mathf.PI*4+k*Mathf.PI;l.SetPosition(i,new Vector3(Mathf.Cos(a)*.46f,.06f+t*.43f,Mathf.Sin(a)*.46f)*size);}}ice.SetActive(false);roots.SetActive(false);}
 void LateUpdate(){ice.SetActive(!monster.IsDead&&monster.Frozen);roots.SetActive(!monster.IsDead&&monster.Rooted);}
 void OnDestroy(){if(ice)Destroy(ice);if(roots)Destroy(roots);}
}
}
