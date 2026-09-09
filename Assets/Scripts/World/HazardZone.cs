using UnityEngine;
namespace WitchPlayground
{
    public sealed class HazardZone:MonoBehaviour
    {
        public WitchPlayer player;public float radius=1.25f;float nextPulse;
        void Update()
        {
            if(Time.time<nextPulse)return;nextPulse=Time.time+2;
            PlaygroundFX.Burst(transform.position+Vector3.up*.035f,new Color(1,.3f,.3f),radius);
            if(player&&!player.IsDead&&Vector3.ProjectOnPlane(player.transform.position-transform.position,Vector3.up).magnitude<radius)player.TakeDamage(25);
        }
    }
}
