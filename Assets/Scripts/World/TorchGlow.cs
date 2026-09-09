using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed class TorchGlow:MonoBehaviour {
 public Light flameLight;RasterEffect fire;void Start(){fire=ElementalSpells.Sprite(transform.position,2,.32f,.7f);fire.loop=true;}void Update(){if(flameLight)flameLight.intensity=1.2f+Mathf.Sin(Time.time*9+transform.position.x)*.15f;if(fire)fire.transform.position=transform.position;}
}
}
