using UnityEngine;
namespace WitchPlayground {
// Follows the actual head bounds and stun timer; ordinary hit stagger has no stars.
public sealed class StunStars:MonoBehaviour {
 SlimeMonster monster;Transform orbit;Transform[] stars;Renderer[] body;static Mesh shape;static Material gold,outline;
 public bool Visible=>orbit&&orbit.gameObject.activeSelf;
 public Vector3 FirstStarPosition=>stars[0].position;
 void Awake(){monster=GetComponent<SlimeMonster>();body=monster.visual.GetComponentsInChildren<Renderer>();BuildResources();orbit=new GameObject("Stun stars").transform;orbit.SetParent(transform,false);stars=new Transform[3];for(int i=0;i<3;i++){var root=new GameObject("Orbiting star "+i).transform;root.SetParent(orbit,false);stars[i]=root;Part(root,outline,1.20f,.008f);Part(root,gold,1,0);}orbit.gameObject.SetActive(false);}
 static void BuildResources(){if(!shape){shape=new Mesh{name="Five point stun star"};var v=new Vector3[11];var t=new int[30];for(int i=0;i<10;i++){float a=Mathf.PI*.5f+i*Mathf.PI/5;float r=i%2==0?1:.43f;v[i+1]=new Vector3(Mathf.Cos(a)*r,Mathf.Sin(a)*r,0);t[i*3]=0;t[i*3+1]=i+1;t[i*3+2]=(i+1)%10+1;}shape.vertices=v;shape.triangles=t;shape.RecalculateNormals();}if(!gold){gold=new Material(Shader.Find("Sprites/Default")){color=new Color(1,.85f,.18f)};outline=new Material(Shader.Find("Sprites/Default")){color=new Color(.28f,.13f,.025f)};}}
 static void Part(Transform root,Material mat,float scale,float z){var p=new GameObject("Star face");p.layer=9;p.transform.SetParent(root,false);p.transform.localPosition=Vector3.forward*z;p.transform.localScale=Vector3.one*scale;p.AddComponent<MeshFilter>().sharedMesh=shape;var r=p.AddComponent<MeshRenderer>();r.sharedMaterial=mat;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;}
 void LateUpdate(){bool visible=!monster.IsDead&&monster.HardStunned;orbit.gameObject.SetActive(visible);if(!visible)return;float top=monster.HitPoint.y+.35f;foreach(var r in body)if(r&&r.enabled)top=Mathf.Max(top,r.bounds.max.y);float radius=monster.isBoss?.8f:.39f,size=monster.isBoss?.23f:.15f;var center=new Vector3(transform.position.x,top+.24f,transform.position.z);var camera=Camera.main;for(int i=0;i<3;i++){float a=Time.time*3.8f+i*Mathf.PI*2/3;stars[i].position=center+new Vector3(Mathf.Cos(a)*radius,Mathf.Sin(a*2)*.045f,Mathf.Sin(a)*radius);stars[i].rotation=(camera?camera.transform.rotation:Quaternion.identity)*Quaternion.Euler(0,0,Mathf.Sin(a)*15);stars[i].localScale=Vector3.one*size;}}
 void OnDestroy(){if(orbit)Destroy(orbit.gameObject);}
}
}
