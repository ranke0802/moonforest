using UnityEngine;
namespace WitchPlayground
{
    public sealed class PracticeDummy:MonoBehaviour
    {
        public int maxHealth=100;public int Health{get;private set;}=100;
        public int LastDamage{get;private set;} public float LastHitAt{get;private set;}
        public int HitsReceived{get;private set;}
        public Transform body;float flashUntil,resetAt;Quaternion restRotation;Renderer[] renderers;
        MaterialPropertyBlock block;
        void Awake(){Health=maxHealth;restRotation=body?body.localRotation:Quaternion.identity;renderers=GetComponentsInChildren<Renderer>();block=new MaterialPropertyBlock();}
        public void TakeHit(int amount)
        {
            if(Health<=0)return;LastDamage=amount;LastHitAt=Time.time;Health=Mathf.Max(0,Health-amount);HitsReceived++;flashUntil=Time.time+.18f;
            if(Health==0)resetAt=Time.time+3;
        }
        void Update()
        {
            if(Health==0&&Time.time>=resetAt)Health=maxHealth;
            if(body){Quaternion target=Health==0?Quaternion.Euler(0,0,65):Time.time<flashUntil?Quaternion.Euler(-12,0,0):restRotation;body.localRotation=Quaternion.Slerp(body.localRotation,target,Time.deltaTime*15);}
            block.SetColor("_EmissionColor",Time.time<flashUntil?new Color(.4f,.9f,1f)*2:Color.black);
            foreach(var r in renderers)r.SetPropertyBlock(block);
        }
    }
}
