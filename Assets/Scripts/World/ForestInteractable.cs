using UnityEngine;
namespace WitchPlayground {
public sealed class ForestInteractable:MonoBehaviour {
 public enum Kind{NPC,Sign,Tool,Rest}public Kind kind;public string displayName;[TextArea]public string message;public bool healer;public Transform visual;public Vector3 checkpoint;public bool Collected{get;private set;}public float Radius=>kind==Kind.Rest?4:2.2f;Vector3 baseLocal;float phase;
 public string Name=>kind==Kind.Rest?Loc.T("낡은 마차 · 휴식","Rusty Caravan · Rest"):kind==Kind.Sign?Loc.T("숲길 안내판","Woodland Signboard"):kind==Kind.Tool?Loc.T("별빛 마법서","Starlit Spellbook"):healer?Loc.T("브램 · 숲의 약사","Bram · Forest Healer"):Loc.T("루미 · 숲길 안내자","Lumi · Forest Guide");
 public string Dialogue=>AdventureProgress.Instance&&kind==Kind.NPC&&!healer?AdventureProgress.Instance.Objective:kind==Kind.Rest?Loc.T("체력과 마나를 회복했어요. 돌아올 지점도 저장했어요.","HP and MP restored. Checkpoint saved."):kind==Kind.Sign?Loc.T("횃불을 따라가면 슬라임과 꿀벌을 만날 수 있어요. 1: 그림자, 2: 언어, B: 가방, V: 스킬, C: 상태창, Tab: 스킬 선택.","Follow the torches to find slimes and bees. 1: shadows, 2: language, B: bag, V: skills, C: stats, Tab: select skill.","松明に沿ってスライムと蜂を探しましょう。1: 影、2: 言語、C: 状態、B: バッグ、V: スキル、Tab: スキル選択。"):healer?Loc.T("잠시 쉬어 가세요. 체력과 마나를 모두 회복해 드렸어요.","Rest a moment. Your HP and MP are fully restored."):Loc.T("적을 처치해 성장해 보세요. 스킬 선택 후 우클릭으로 시전해요. 30마리를 처치하면 달늑대가 나타나요.","Defeat monsters for XP. Select a skill and right-click to cast. Defeat 30 monsters to face the Moonwolf.","敵を倒して成長しましょう。スキルを選び右クリックで発動。30体倒すと銀月の狼が現れます。");
 void Start(){if(visual)baseLocal=visual.localPosition;phase=transform.position.x;}
 void Update(){if(visual&&!Collected&&kind==Kind.NPC)visual.localPosition=baseLocal+Vector3.up*Mathf.Sin(Time.time*1.8f+phase)*.018f;}
 public bool Interact(WitchPlayer player){if(!player||player.IsDead||Collected||Vector3.Distance(player.transform.position,transform.position)>Radius)return false;ForestSound.Play(healer||kind==Kind.Rest?"rest":kind==Kind.Tool?"pickup":"talk",transform.position,.7f);player.CancelChannel();if(kind==Kind.NPC&&!healer)AdventureProgress.Instance?.TalkGuide();if(kind==Kind.Tool){Collected=true;var r=player.GetComponent<RpgProgress>();if(r)r.SetEquipped(true);}if(healer||kind==Kind.Rest){player.RestoreHealth();RpgVFX.Heal(player.transform.position);}if(kind==Kind.Rest)player.SetCheckpoint(checkpoint);return true;}
}
public sealed class EquippedTome:MonoBehaviour{Vector3 rest;void Start(){rest=transform.localPosition;}void LateUpdate(){transform.localPosition=rest+Vector3.up*Mathf.Sin(Time.time*2.5f)*.035f;transform.Rotate(Vector3.up,12*Time.deltaTime,Space.Self);}}
public sealed class ForestInteraction:MonoBehaviour {
 public WitchPlayer player;public ForestInteractable Near{get;private set;}public ForestInteractable Dialog{get;private set;}public float DialogUntil{get;private set;}ForestInteractable[] all;
 void Start(){all=FindObjectsByType<ForestInteractable>();}
 void Update(){if(RpgUI.Blocking||player.IsDead){Near=null;return;}Near=null;float distance=float.MaxValue;foreach(var item in all){if(!item||item.Collected)continue;float d=Vector3.Distance(player.transform.position,item.transform.position);if(d<item.Radius&&d<distance){Near=item;distance=d;}}if(Near&&Input.GetKeyDown(KeyCode.E)&&Near.Interact(player)){Dialog=Near;DialogUntil=Time.time+7;}}
}
}
