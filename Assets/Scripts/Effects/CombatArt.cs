using UnityEngine;
namespace WitchPlayground {
public static class CombatArt {
 static Material warrior,archer;
 public static CombatSprite Burst(Vector3 at,bool bow,int row,float size,float seconds){
  var o=GameObject.CreatePrimitive(PrimitiveType.Quad);o.name=(bow?"Archer":"Warrior")+" painted VFX "+row;o.layer=9;Object.Destroy(o.GetComponent<Collider>());o.transform.position=at;
  if(!warrior)warrior=Resources.Load<Material>("RPG/WarriorPaint");if(!archer)archer=Resources.Load<Material>("RPG/ArcherPaint");var r=o.GetComponent<Renderer>();r.sharedMaterial=bow?archer:warrior;r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;
  var fx=o.AddComponent<CombatSprite>();fx.row=row;fx.size=size;fx.duration=seconds;return fx;
 }
 public static CombatSprite Ground(Vector3 at,bool bow,int row,float size,float seconds,float opacity=1,float yaw=0){var fx=Burst(at,bow,row,size,seconds);fx.ground=true;fx.opacity=opacity;fx.yaw=yaw;if(seconds>1)fx.fixedFrame=1;return fx;}
 public static void Slash(Vector3 at,Vector3 dir,float radius,bool reverse){float yaw=Quaternion.LookRotation(dir).eulerAngles.y;bool fan=radius>3;var g=Ground(at+dir*(fan?radius*.3f:0),false,fan?3:0,radius*(fan?1.45f:1.8f),.48f,fan?.4f:.65f,fan?yaw:yaw-90);g.mirror=reverse;var v=Burst(at+dir*radius*.6f+Vector3.up*.65f,false,fan?3:0,radius*.6f,.38f);v.opacity=.4f;v.mirror=reverse;}
 public static void Overhead(Vector3 at,Vector3 dir){var point=at+dir*1.3f;Ground(point,false,3,2.2f,.4f,.5f,Quaternion.LookRotation(dir).eulerAngles.y);var hit=Burst(point+Vector3.up*.65f,false,3,1.4f,.34f);hit.opacity=.65f;}
 public static void Dash(Vector3 at,Vector3 dir){var fx=Burst(at+Vector3.up*.7f,false,1,2.3f,.5f);fx.direction=dir;fx.directional=true;Ground(at,false,1,3,.45f,.7f,Quaternion.LookRotation(dir).eulerAngles.y-90);}
 public static void Shield(Transform owner,float duration){var fx=Burst(owner.position+Vector3.up*.85f+owner.forward*.5f,false,2,1.65f,duration);fx.follow=owner;fx.followOffset=new Vector3(0,.85f,.55f);fx.upright=true;fx.fixedFrame=1;fx.opacity=.85f;Ground(owner.position,false,2,1.7f,duration,.3f);}
}
// Two adjacent atlas frames cross-fade; terrain decals use a fitted mesh, not a flat billboard.
public sealed class CombatSprite:MonoBehaviour {
 public int row,fixedFrame=-1;public float size=1,duration=.5f,opacity=1,spin,growth,yaw;public bool loop,ground,mirror,upright,directional;public Vector3 direction,followOffset;public Transform follow;
 float age;Renderer render;MaterialPropertyBlock props;Mesh mesh;bool hadFollow;
 void Start(){render=GetComponent<Renderer>();props=new MaterialPropertyBlock();hadFollow=follow;if(ground)BuildGround();}
 void BuildGround(){const int n=12;var v=new Vector3[(n+1)*(n+1)];var uv=new Vector2[v.Length];var tri=new int[n*n*6];var rotation=Quaternion.Euler(0,yaw,0);for(int z=0;z<=n;z++)for(int x=0;x<=n;x++){int i=z*(n+1)+x;Vector3 local=rotation*new Vector3((x/(float)n-.5f)*size,0,(z/(float)n-.5f)*size);var world=transform.position+local;local.y=GroundSpellTravel.GroundPosition(world,.085f).y-transform.position.y;v[i]=local;uv[i]=new Vector2(x/(float)n,z/(float)n);if(x<n&&z<n){int t=(z*n+x)*6;tri[t]=i;tri[t+1]=i+n+1;tri[t+2]=i+1;tri[t+3]=i+1;tri[t+4]=i+n+1;tri[t+5]=i+n+2;}}mesh=new Mesh{name="Painted combat terrain decal"};mesh.vertices=v;mesh.uv=uv;mesh.triangles=tri;mesh.RecalculateNormals();mesh.RecalculateBounds();GetComponent<MeshFilter>().sharedMesh=mesh;}
 void LateUpdate(){age+=Time.deltaTime;if((!loop&&age>=duration)||(hadFollow&&!follow)){Destroy(gameObject);return;}if(!render.sharedMaterial){Destroy(gameObject);return;}float t=loop?Mathf.Repeat(age/Mathf.Max(.1f,duration),1):age/Mathf.Max(.01f,duration);float frame=fixedFrame>=0?fixedFrame:Mathf.Min(3,t*3.6f);int f=Mathf.FloorToInt(frame);float fade=loop?1:Mathf.Min(1,age/.045f)*Mathf.Clamp01((duration-age)/Mathf.Min(.25f,duration*.45f));
  if(follow)transform.position=follow.TransformPoint(followOffset);
  if(!ground){transform.localScale=new Vector3(size*(mirror?-1:1),size,1)*(1+growth*t);var cam=Camera.main;if(upright&&follow)transform.rotation=Quaternion.LookRotation(follow.forward);else if(cam){transform.rotation=cam.transform.rotation;if(directional){var d=cam.transform.InverseTransformDirection(direction);transform.rotation*=Quaternion.Euler(0,0,Mathf.Atan2(d.y,d.x)*Mathf.Rad2Deg);}else transform.rotation*=Quaternion.Euler(0,0,spin*age);}}
  props.SetVector("_Frames",new Vector4(f,Mathf.Min(3,f+1),row,frame-f));props.SetColor("_Tint",new Color(1,1,1,opacity*fade));props.SetFloat("_Mirror",ground&&mirror?1:0);render.SetPropertyBlock(props);
 }
 void OnDestroy(){if(mesh)Destroy(mesh);}
}
public sealed class ArrowGleam:MonoBehaviour {
 CombatSprite glint;ArrowFlight flight;float trail;
 void Start(){flight=GetComponent<ArrowFlight>();glint=CombatArt.Burst(transform.position,true,1,.43f,1);glint.loop=true;glint.fixedFrame=1;glint.opacity=.6f;glint.directional=true;}
 void LateUpdate(){if(!flight||flight.Lodged){if(glint)Destroy(glint.gameObject);enabled=false;return;}if(glint){glint.transform.position=transform.position+flight.direction*.3f;glint.direction=flight.direction;}trail+=Time.deltaTime;if(trail>.05f){trail=0;var mote=CombatArt.Burst(transform.position,true,1,.28f,.2f);mote.opacity=.35f;mote.directional=true;mote.direction=flight.direction;}}
 void OnDestroy(){if(glint)Destroy(glint.gameObject);}
}
}
