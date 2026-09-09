using UnityEngine;
namespace WitchPlayground {
public sealed class AdventureNode:MonoBehaviour {
 public string Id;public AdventureProgress Adventure;RasterEffect ground,glow;Light lightSource;
 public string Label=>Id=="gate"?AdventureProgress.T("달늑대 앞 쉼터","Moonwolf refuge","銀月の狼の休憩所"):Id=="elite"?AdventureProgress.T("꿀날개 둥지 정화","Cleanse the Honeywing nest","蜂の巣を浄化"):Id.StartsWith("herb")?AdventureProgress.T("달빛 약초 채집","Gather moon herb","月光草を採集"):AdventureProgress.T("오염 정화","Cleanse corruption","汚染を浄化");
 void OnEnable(){if(string.IsNullOrEmpty(Id))return;bool herb=Id.StartsWith("herb"),gate=Id=="gate";Color color=herb?new Color(.45f,1,.65f):gate?new Color(1,.8f,.42f):new Color(.8f,.35f,1);ground=ElementalSpells.Sprite(transform.position+Vector3.up*.06f,0,herb?1.25f:2.3f,1,true);ground.loop=true;ground.tint=color;if(herb){glow=RpgVFX.Sprite(transform.position+Vector3.up*.35f,3,.8f,1);glow.loop=true;}var go=new GameObject("Objective glow");go.transform.SetParent(transform);go.transform.localPosition=Vector3.up*.5f;lightSource=go.AddComponent<Light>();lightSource.type=LightType.Point;lightSource.color=color;lightSource.range=3;lightSource.intensity=.7f;lightSource.shadows=LightShadows.None;}
 void OnDisable(){if(ground)Destroy(ground.gameObject);if(glow)Destroy(glow.gameObject);if(lightSource)Destroy(lightSource.gameObject);}
 void OnDestroy(){OnDisable();}
}
}
