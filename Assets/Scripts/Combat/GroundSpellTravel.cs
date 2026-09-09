using UnityEngine;
namespace WitchPlayground {
// A horizontal aiming lane follows the terrain; only the vertical hit margin is widened.
public static class GroundSpellTravel {
 public const float VerticalMargin=1.6f;
 const int Terrain=1<<10,Enemies=1<<14;
 static readonly Collider[] overlaps=new Collider[32];static readonly RaycastHit[] hits=new RaycastHit[32];
 // Only authored walls and solid props stop spells; decorative/default-layer colliders do not.
 const int Solid=(1<<11)|(1<<13);
 public static Vector3 GroundPosition(Vector3 position,float clearance){if(Physics.Raycast(position+Vector3.up*64,Vector3.down,out RaycastHit h,128,Terrain,QueryTriggerInteraction.Ignore))position.y=h.point.y+clearance;return position;}
 public static bool Step(ref Vector3 position,Vector3 direction,float distance,float radius,float clearance,out SlimeMonster enemy,out Vector3 impact){enemy=null;impact=position;direction=Vector3.ProjectOnPlane(direction,Vector3.up).normalized;if(direction.sqrMagnitude<.01f||distance<=0)return false;position=GroundPosition(position,clearance);int count=Mathf.Max(1,Mathf.CeilToInt(distance/.25f));float length=distance/count;
  for(int i=0;i<count;i++){Vector3 end=GroundPosition(position+direction*length,clearance);Vector3 delta=end-position;float travel=delta.magnitude;if(travel<.00001f)continue;Vector3 forward=delta/travel;
   bool solid=Physics.SphereCast(position,radius,forward,out RaycastHit wall,travel,Solid,QueryTriggerInteraction.Ignore);
   float nearest=solid?wall.distance:float.PositiveInfinity;SlimeMonster target=null;
   // Include monsters already overlapping the beginning of this swept segment.
   int overlapCount=Physics.OverlapCapsuleNonAlloc(position-Vector3.up*VerticalMargin,position+Vector3.up*VerticalMargin,radius,overlaps,Enemies,QueryTriggerInteraction.Ignore);for(int n=0;n<overlapCount;n++){var e=overlaps[n].GetComponentInParent<SlimeMonster>();if(e&&!e.IsDead){float along=Vector3.Dot(Vector3.ProjectOnPlane(e.transform.position-position,Vector3.up),direction);if(along>=-.3f&&nearest>0){target=e;nearest=0;}}}
   int hitCount=Physics.CapsuleCastNonAlloc(position-Vector3.up*VerticalMargin,position+Vector3.up*VerticalMargin,radius,forward,hits,travel,Enemies,QueryTriggerInteraction.Ignore);for(int n=0;n<hitCount;n++){var h=hits[n];var e=h.collider.GetComponentInParent<SlimeMonster>();if(e&&!e.IsDead&&h.distance<nearest){target=e;nearest=h.distance;}}
   if(target){enemy=target;impact=target.HitPoint;position+=forward*Mathf.Clamp(nearest,0,travel);return true;}if(solid){impact=wall.point;position+=forward*wall.distance;return true;}position=end;
  }impact=position;return false;
 }
}
}
