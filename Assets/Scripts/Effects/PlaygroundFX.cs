using UnityEngine;
namespace WitchPlayground {
public static class PlaygroundFX {
 public static Material Glow=>RpgVFX.Material(false);
 public static Color Tint(float p)=>Color.Lerp(new Color(.45f,.7f,1),new Color(1,.7f,.3f),p);
 public static void Fire(Vector3 p,Vector3 d,float power,int damage,WitchPlayer owner){RpgVFX.Fire(p,d,new HitData{damage=damage,charge=power,owner=owner,knockback=Mathf.Lerp(1.4f,5.4f,power),direction=d});}
 public static ChargeVisual Charge(WitchPlayer p){var o=new GameObject("Raster charge");var v=o.AddComponent<ChargeVisual>();v.player=p;return v;}
 public static void Burst(Vector3 p,Color c,float radius){RpgVFX.Impact(p,radius>1);}
}
public sealed class ChargeVisual:MonoBehaviour {
 public WitchPlayer player;RasterEffect sprite;
 void Start(){sprite=RpgVFX.Sprite(player.transform.position,0,.25f,.4f);sprite.loop=true;}
 void Update(){if(!player||!player.IsCharging){Destroy(gameObject);return;}if(sprite){sprite.transform.position=player.transform.position+Vector3.up*1.03f+player.transform.forward*.6f-(Camera.main?Camera.main.transform.forward:Vector3.forward)*.18f;sprite.size=.25f+player.Charge01*.85f;}}
 void OnDestroy(){if(sprite)Destroy(sprite.gameObject);}
}

}
