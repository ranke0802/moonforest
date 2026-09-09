using UnityEngine;
using System.Collections.Generic;
namespace WitchPlayground {
public class CombatText {public Vector3 point;public Vector2 offset;public int amount;public bool healing,player;public string text;public Color color;public bool critical;public float start,duration;}
public static class RpgVFX {
 public static readonly List<CombatText> Texts=new List<CombatText>();static Material magic,impact;
 public static Material Material(bool hit){if(hit&&!impact)impact=Resources.Load<Material>("RPG/ImpactMaterial");if(!hit&&!magic)magic=Resources.Load<Material>("RPG/MagicMaterial");return hit?impact:magic;}
 public static RasterEffect Sprite(Vector3 pos,int row,float size,float duration,bool ground=false,bool hit=false){var o=GameObject.CreatePrimitive(PrimitiveType.Quad);o.name=hit?"Painted impact":"Painted magic";o.layer=9;Object.Destroy(o.GetComponent<Collider>());o.transform.position=pos;var r=o.GetComponent<Renderer>();r.sharedMaterial=Material(hit);r.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;r.receiveShadows=false;var fx=o.AddComponent<RasterEffect>();fx.row=row;fx.size=size;fx.duration=duration;fx.ground=ground;fx.hit=hit;return fx;}
 public static void Fire(Vector3 origin,Vector3 direction,HitData hit,SlimeMonster homingTarget=null){var o=new GameObject("Energy Ball");o.layer=9;o.transform.position=origin;var b=o.AddComponent<MagicProjectile>();b.homingTarget=homingTarget;b.direction=direction;b.hit=hit;b.damage=hit.damage;b.power=hit.charge;b.owner=hit.owner;}
 public static void Impact(Vector3 pos,bool crit=false){Sprite(pos-(Camera.main?Camera.main.transform.forward:Vector3.forward)*.42f,crit?1:0,crit?1.35f:.75f,.38f,false,true);}
 public static void Heal(Vector3 pos){Sprite(pos+Vector3.up*.08f,3,2.1f,.9f,true);Sprite(pos+Vector3.up*.75f,3,1,.8f);}
 public static void Frost(Vector3 pos,HitData hit,float radius){Sprite(pos+Vector3.up*.12f,1,radius*2,.65f,true);Area(pos,radius,hit,null,true);}
 public static void Meteor(Vector3 pos,HitData hit,float radius){var o=new GameObject("Starfall cast");o.transform.position=pos;var m=o.AddComponent<MeteorFall>();m.hit=hit;m.radius=radius;}
 public static void Area(Vector3 pos,float radius,HitData hit,SlimeMonster excluded=null,bool freeze=false){var seen=new HashSet<SlimeMonster>();if(excluded)seen.Add(excluded);foreach(var c in Physics.OverlapSphere(pos+Vector3.up*.5f,radius,1<<14,QueryTriggerInteraction.Ignore)){var monster=c.GetComponentInParent<SlimeMonster>();if(!monster||monster.IsDead||!seen.Add(monster))continue;Vector3 to=monster.HitPoint;if(Physics.Linecast(pos+Vector3.up*.6f,to,out RaycastHit block,(1<<10)|(1<<11),QueryTriggerInteraction.Ignore)){if(RpgProgress.Instance&&RpgProgress.Instance.TestSession)Debug.Log("AREA_BLOCKED "+monster.name+" by "+block.collider.name+" from "+pos+" to "+to);continue;}var one=hit;one.direction=Vector3.ProjectOnPlane(to-pos,Vector3.up).normalized;monster.ReceiveHit(one);if(freeze)monster.SlowFor(1.5f);}}
 // Merge rapid ticks at the same target and separate damage/healing into screen-space lanes.
 static void AddText(Vector3 pos,int amount,bool crit,bool player,bool healing){
  Texts.RemoveAll(t=>Time.time-t.start>=t.duration);
  foreach(var t in Texts){if(t.healing==healing&&t.player==player&&t.critical==crit&&Time.time-t.start<.14f&&Vector3.Distance(t.point,pos)<.25f){t.amount+=amount;t.text=(healing?"+":player?"-":"")+t.amount;return;}}
  int lane=0;foreach(var t in Texts)if(Vector3.Distance(t.point,pos)<1.1f)lane++;
  if(Texts.Count>=72)Texts.RemoveAt(0);
  Texts.Add(new CombatText{point=pos,amount=amount,healing=healing,player=player,offset=new Vector2((healing?40:-28)+(lane%3-1)*20,-(lane%4)*16),text=(healing?"+":player?"-":"")+amount,color=healing?new Color(.4f,1,.65f):player?new Color(1,.38f,.42f):crit?new Color(1,.82f,.28f):Color.white,critical=crit,start=Time.time,duration=crit?1.05f:.8f});
 }
 public static void DamageText(Vector3 pos,int amount,bool crit,bool player=false){AddText(pos,amount,crit,player,false);}
 public static void HealText(Vector3 pos,int amount){AddText(pos,amount,false,true,true);}
 public static void EvadeText(Vector3 pos){if(Texts.Exists(t=>t.text==Loc.T("회피","DODGE","回避")&&Time.time-t.start<.35f))return;Texts.Add(new CombatText{point=pos,text=Loc.T("회피","DODGE","回避"),color=new Color(.6f,1,1),start=Time.time,duration=.7f});}

}
public sealed class RasterEffect:MonoBehaviour {
 public int row;public float size=1,duration=.5f;public bool ground,hit,loop,expansion;public float opacity=1;public Color tint=Color.white;float age;MaterialPropertyBlock block;Renderer render;
 Mesh groundMesh;
 void Start(){render=GetComponent<Renderer>();block=new MaterialPropertyBlock();if(ground)BuildGround();}
 void BuildGround(){const int n=16;var vertices=new Vector3[(n+1)*(n+1)];var uv=new Vector2[vertices.Length];var triangles=new int[n*n*6];for(int z=0;z<=n;z++)for(int x=0;x<=n;x++){int i=z*(n+1)+x;Vector3 v=new Vector3((x/(float)n-.5f)*size,0,(z/(float)n-.5f)*size);Vector3 world=transform.position+v;if(Physics.Raycast(world+Vector3.up*40,Vector3.down,out RaycastHit hit,80,1<<10))v.y=hit.point.y-transform.position.y+.065f;vertices[i]=v;uv[i]=new Vector2(x/(float)n,z/(float)n);if(x<n&&z<n){int t=(z*n+x)*6;triangles[t]=i;triangles[t+1]=i+n+1;triangles[t+2]=i+1;triangles[t+3]=i+1;triangles[t+4]=i+n+1;triangles[t+5]=i+n+2;}}groundMesh=new Mesh{name="Terrain-following spell decal"};groundMesh.vertices=vertices;groundMesh.uv=uv;groundMesh.triangles=triangles;groundMesh.RecalculateNormals();groundMesh.RecalculateBounds();GetComponent<MeshFilter>().sharedMesh=groundMesh;}
 void OnDestroy(){if(groundMesh)Destroy(groundMesh);}
 void LateUpdate(){age+=Time.deltaTime;if(!loop&&age>=duration){Destroy(gameObject);return;}var tex=render.sharedMaterial.mainTexture;float t=loop?(age/Mathf.Max(.1f,duration))%1:age/duration;int frame=Mathf.Min(3,(int)(t*4));int rows=hit?2:4;float aspect=tex?(tex.width/4f)/(tex.height/(float)rows):1;
  if(ground){transform.localScale=Vector3.one;transform.rotation=Quaternion.identity;}else{transform.localScale=new Vector3(size,size/Mathf.Max(aspect,.1f),1);if(Camera.main)transform.rotation=Camera.main.transform.rotation;}
  var color=tint;color.a=opacity*(loop?1:Mathf.Clamp01((1-t)*2));block.SetColor("_Tint",color);block.SetVector("_UVRect",new Vector4(frame/4f,1-(row+1f)/rows,.25f,1f/rows));render.SetPropertyBlock(block);
 }
}
public sealed class MagicProjectile:MonoBehaviour {
 public SlimeMonster homingTarget;public bool arrow;public Vector3 direction;public HitData hit;public float power;public int damage;public WitchPlayer owner;float age,trail;RasterEffect image;
 void Start(){if(hit.damage==0)hit=new HitData{damage=damage,charge=power,owner=owner,knockback=2,direction=direction};image=RpgVFX.Sprite(transform.position,0,Mathf.Lerp(.42f,1.65f,power),.35f);image.loop=true;if(arrow){image.expansion=true;image.row=3;image.size=.7f+power*.6f;image.GetComponent<Renderer>().sharedMaterial=Resources.Load<Material>("RPG/ElementsMaterial");}}
 void Update(){if(Time.timeScale==0)return;if(homingTarget&&!homingTarget.IsDead)direction=Vector3.ProjectOnPlane(homingTarget.HitPoint-transform.position,Vector3.up).normalized;float dist=Mathf.Lerp(23,18,power)*Time.deltaTime;Vector3 next=transform.position;if(GroundSpellTravel.Step(ref next,direction,dist,Mathf.Lerp(.09f,.25f,power),.85f,out SlimeMonster monster,out Vector3 impact)){transform.position=next;ForestSound.Play("magic_hit",impact,.45f);if(monster)monster.ReceiveHit(hit);else RpgVFX.Impact(impact,hit.critical);if(power>=.85f){var splash=hit;splash.damage=Mathf.RoundToInt(hit.damage*.5f);RpgVFX.Area(impact,1.7f,splash,monster);}Destroy(gameObject);return;}
  transform.position=next;if(image)image.transform.position=next;age+=Time.deltaTime;trail+=Time.deltaTime;if(trail>.045f){trail=0;var mote=RpgVFX.Sprite(next,0,.18f+power*.3f,.2f);mote.opacity=.3f;}if(age>3)Destroy(gameObject);
 }
 void OnDestroy(){if(image)Destroy(image.gameObject);}
}
public sealed class MeteorFall:MonoBehaviour {
 public HitData hit;public float radius;float age;RasterEffect meteor;
 void Start(){meteor=RpgVFX.Sprite(transform.position+Vector3.up*7,2,1.5f,.65f);meteor.loop=true;RpgVFX.Sprite(transform.position+Vector3.up*.08f,2,radius*1.3f,.65f,true).opacity=.5f;}
 void Update(){age+=Time.deltaTime;if(meteor)meteor.transform.position=transform.position+Vector3.up*Mathf.Lerp(7,0,age/.65f);if(age<.65f)return;RpgVFX.Sprite(transform.position+Vector3.up*.6f,2,radius*1.5f,.6f);RpgVFX.Impact(transform.position+Vector3.up*.5f,true);if(RpgProgress.Instance&&RpgProgress.Instance.TestSession)Debug.Log("METEOR_IMPACT "+transform.position+" overlaps "+Physics.OverlapSphere(transform.position+Vector3.up*.5f,radius,1<<14).Length);RpgVFX.Area(transform.position,radius,hit);if(meteor)Destroy(meteor.gameObject);Destroy(gameObject);}
}
}
