using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
namespace WitchPlayground {
public enum AdventureStage {Offer,Road,Purify,Gate,Boss,Reward,Camp,Herbs,Elite,Complete}
[DefaultExecutionOrder(-40)]public sealed class AdventureProgress:MonoBehaviour {
 public static AdventureProgress Instance;
 [Serializable]public class Data {
  public int version=2;public AdventureStage stage;public List<string> defeated=new List<string>();public int purified,herbs,sideDone,rewardSource=-1;public bool completionNotice;
  public bool mainAccepted,introComplete,bossUnlocked,bossCleared;public int kills,survey,regions,essence,sideActive=-1,relicRewards,danger=1,unlockedDanger=1,clearedDangers,retry;public int eventFirst;public float eventCooldown;
  public AdventureRelics.Data relics=new AdventureRelics.Data();public QuestProgress.Data contracts=new QuestProgress.Data();
 }
 public Data State=new Data();public AdventureStage Stage=>State.stage;public bool Ready{get;private set;}public bool BossActive=>Stage==AdventureStage.Boss;
 public Vector3 Camp{get;private set;}public Vector3 Arena{get;private set;}public Vector3 Gate{get;private set;}public Vector3 Guide{get;private set;}public Vector3 GuideHead{get;private set;}
 public Vector3[] Sites{get;private set;}public Vector3[] Herbs{get;private set;}public Vector3[] Regions{get;private set;}
 public readonly Dictionary<string,SlimeMonster> Enemies=new Dictionary<string,SlimeMonster>();
 public AdventureNode Near{get;private set;}public AdventureRelics Relics{get;private set;}public WorldPopulation Population{get;private set;}public QuestProgress Quests{get;private set;}
 public bool TestFreezeEnemies;public int EventKind{get;private set;}=-1;public bool EventRunning=>EventKind>=0;float eventReady,corpseUntil;
 WitchPlayer player;RpgSession session;ForestInteractable[] interactables;readonly List<AdventureNode> nodes=new List<AdventureNode>();readonly Dictionary<SlimeMonster,int> counted=new Dictionary<SlimeMonster,int>();float lastDamage=-100,nextScan;bool configured;
 public static string T(string ko,string en,string ja)=>Loc.T(ko,en,ja);
 public static string RegionName(int r)=>r==0?T("숲 입구","Forest Edge","森の入口"):r==1?T("이슬 숲길","Dew Trail","露の小道"):T("달그늘 터","Moonshade","月影の地");
 public string GuideMarker=>State.relicRewards>0||Quests&&Quests.HasReward?"!":!State.mainAccepted||State.bossCleared&&State.sideDone!=3&&State.sideActive<0?"?":"";
 public int RoadKills=>State.kills;public int SiteCount=>BitCount(State.purified);public int HerbCount=>BitCount(State.herbs);public int RegionCount=>BitCount(State.regions);
 static int BitCount(int n){int count=0;while(n>0){count+=n&1;n>>=1;}return count;}
 void Awake(){Instance=this;player=GetComponent<WitchPlayer>();session=GetComponent<RpgSession>();Relics=GetComponent<AdventureRelics>()??gameObject.AddComponent<AdventureRelics>();Quests=GetComponent<QuestProgress>()??gameObject.AddComponent<QuestProgress>();Quests.Import(null);}
 void Start(){Configure();}
 public void Configure(){if(configured)return;configured=true;Camp=player.Spawn;interactables=FindObjectsByType<ForestInteractable>();var guide=interactables.First(n=>n.kind==ForestInteractable.Kind.NPC&&!n.healer);Guide=guide.transform.position;var renderers=guide.GetComponentsInChildren<Renderer>();GuideHead=Guide+Vector3.up*(renderers.Length>0?renderers.Max(r=>r.bounds.max.y)-Guide.y+.35f:2);
  var originals=FindObjectsByType<SlimeMonster>().Where(e=>!e.isBoss).ToArray();var slime=originals.First(e=>!e.isBee);var bee=originals.First(e=>e.isBee);foreach(var e in originals)e.gameObject.SetActive(false);
  Sites=new[]{Safe(new Vector3(11,0,3)),Safe(new Vector3(-3,0,-5))};Herbs=new[]{Safe(new Vector3(5,0,18)),Safe(new Vector3(14,0,8)),Safe(new Vector3(9,0,0))};Arena=Safe(new Vector3(-8,0,-13),1);Gate=Safe(new Vector3(-3,0,-8));Regions=new[]{Safe(new Vector3(7,0,17)),Safe(new Vector3(12,0,5)),Safe(new Vector3(-4,0,-8))};
  for(int i=0;i<2;i++)AddNode("site"+i,Sites[i]);AddNode("gate",Gate);AddNode("camp",Camp);for(int i=0;i<3;i++)AddNode("herb"+i,Herbs[i]);AddNode("elite",Sites[0]+Vector3.forward*3);AddNode("swarm",Herbs[1]+Vector3.left*3);
  for(int kind=0;kind<2;kind++)for(int i=0;i<3;i++){var e=Instantiate(kind==0?bee:slime,Safe((kind==0?Sites[0]:Herbs[1])+Quaternion.Euler(0,i*120,0)*Vector3.forward*3),Quaternion.identity);e.QuestId=(kind==0?"elite":"swarm")+i;e.name=e.QuestId;e.isElite=i==0;e.persistentDefeat=true;e.Region=kind==0?1:0;e.PopulationManaged=true;e.enabled=true;if(i==0){e.transform.localScale*=1.25f;e.gameObject.AddComponent<ForestEliteAttack>();}Enemies[e.QuestId]=e;}
  Population=gameObject.AddComponent<WorldPopulation>();Population.Configure(this,slime,bee);
  Shader.SetGlobalVector("_AdventureClearing",new Vector4(Arena.x,Arena.y,Arena.z,5.5f));Shader.SetGlobalVector("_AdventureSiteA",new Vector4(Sites[0].x,0,Sites[0].z,2.8f));Shader.SetGlobalVector("_AdventureSiteB",new Vector4(Sites[1].x,0,Sites[1].z,2.8f));Ready=true;ApplyWorld();Population.ResetPopulation();
 }
 public static Vector3 Safe(Vector3 wanted,float radius=.4f){for(int ring=0;ring<10;ring++)for(int i=0;i<(ring==0?1:16);i++){var q=wanted+Quaternion.Euler(0,i*22.5f,0)*Vector3.forward*(ring*.5f);if(!Physics.Raycast(q+Vector3.up*80,Vector3.down,out RaycastHit h,160,1<<10)||h.normal.y<.7f)continue;if(Physics.CheckCapsule(h.point+Vector3.up*(radius+.1f),h.point+Vector3.up*1.9f,radius,(1<<11)|(1<<13)))continue;return h.point+Vector3.up*.04f;}Debug.LogError("No adventure ground near "+wanted);return GroundSpellTravel.GroundPosition(wanted,.04f);}
 void AddNode(string id,Vector3 at){var go=new GameObject("Objective · "+id);go.SetActive(false);go.transform.position=at;var n=go.AddComponent<AdventureNode>();n.Id=id;n.Adventure=this;nodes.Add(n);}
 public bool SafeZone(Vector3 at){if(ClassCombat.Flat(at-Camp).magnitude<3.5f||ClassCombat.Flat(at-Gate).magnitude<2.5f)return true;for(int i=0;i<2;i++)if((State.purified&(1<<i))!=0&&ClassCombat.Flat(at-Sites[i]).magnitude<2.4f)return true;return false;}
 public int RegionAt(Vector3 at){return Enumerable.Range(0,3).OrderBy(i=>ClassCombat.Flat(Regions[i]-at).sqrMagnitude).First();}
 public void DiscoverRegion(int region){if(region<0||region>2||(State.regions&(1<<region))!=0)return;State.regions|=1<<region;RefreshStory();RpgUI.Toast(RegionName(region)+T(" 발견"," discovered","を発見"));Save();}
 public void ApplyWorld(){if(!Ready)return;foreach(var n in nodes)n.gameObject.SetActive(NodeVisible(n.Id));foreach(var e in Enemies.Values)e.TestIdle=TestFreezeEnemies;if(!BossActive&&Time.time>=corpseUntil)MoonwolfEvent.Instance?.ResetEncounter();}
 public bool NodeVisible(string id)=>id=="camp"||id=="gate"||id=="elite"||id=="swarm"?true:id.StartsWith("site")?(State.purified&(1<<(id[4]-'0')))==0:id.StartsWith("herb")&&State.sideActive==0&&(State.herbs&(1<<(id[4]-'0')))==0;
 public bool GroupDead(string prefix)=>Enemies.Where(p=>p.Key.StartsWith(prefix)).All(p=>p.Value.IsDead);
 void ResetEvents(){EventKind=-1;eventReady=0;foreach(var e in Enemies.Where(p=>!p.Key.StartsWith("wild")))e.Value.gameObject.SetActive(false);}
 public void NewAdventure(){Configure();State=new Data();corpseUntil=0;Relics.Import(State.relics);Quests.Import(State.contracts);counted.Clear();ResetEvents();player.SetCheckpoint(Camp);player.Teleport(Camp);lastDamage=-100;ApplyWorld();Population.ResetPopulation();}
 public string Export(){State.relics=Relics.State;State.contracts=Quests.State;State.eventCooldown=EventCooldown;return JsonUtility.ToJson(State);}
 public void Import(string json,bool oldBoss){Configure();State=string.IsNullOrEmpty(json)?new Data():JsonUtility.FromJson<Data>(json);bool old=State.version<2||string.IsNullOrEmpty(json);
  if(old){var stage=State.stage;State.kills=Mathf.Max(session.Kills,State.defeated==null?0:State.defeated.Count);State.mainAccepted=stage!=AdventureStage.Offer||oldBoss;State.introComplete=State.mainAccepted;State.bossCleared=oldBoss||stage==AdventureStage.Camp||stage==AdventureStage.Herbs||stage==AdventureStage.Elite||stage==AdventureStage.Complete;State.bossUnlocked=State.bossCleared||stage==AdventureStage.Gate||stage==AdventureStage.Boss||stage==AdventureStage.Reward;State.survey=State.bossUnlocked?80:Mathf.Min(79,State.kills+SiteCount*10);State.regions=State.bossUnlocked?7:0;State.sideActive=stage==AdventureStage.Herbs?0:stage==AdventureStage.Elite?1:-1;State.relicRewards=stage==AdventureStage.Reward||string.IsNullOrEmpty(json)&&oldBoss?1:0;State.danger=1;State.unlockedDanger=State.bossCleared?2:1;State.clearedDangers=State.bossCleared?1:0;State.retry=State.bossCleared?20:0;State.version=2;}
  State.danger=Mathf.Clamp(State.danger,1,3);State.unlockedDanger=Mathf.Clamp(State.unlockedDanger,State.danger,3);State.essence=Mathf.Clamp(State.essence,0,999999);State.sideActive=Mathf.Clamp(State.sideActive,-1,1);State.relicRewards=Mathf.Clamp(State.relicRewards,0,3);Relics.Import(State.relics);Quests.Import(State.contracts);counted.Clear();ResetEvents();eventReady=Time.time+Mathf.Clamp(State.eventCooldown,0,60);corpseUntil=0;if(State.stage==AdventureStage.Boss)State.stage=AdventureStage.Gate;RefreshStory();lastDamage=-100;ApplyWorld();Population.ResetPopulation();
 }
 public void Save(){session.Save();}
 void RefreshStory(){
  if(State.mainAccepted&&!State.introComplete&&State.kills>=5){State.introComplete=true;AddEssence(5);GetComponent<RpgProgress>().GainXP(20);RpgUI.Toast(T("첫 조사 완료 · 자유롭게 숲을 탐사하세요","First survey complete · Explore freely","初調査完了 · 自由に探索しよう"));}
  if(!State.bossUnlocked&&State.mainAccepted&&State.survey>=80&&RegionCount>=2){State.bossUnlocked=true;RpgUI.Toast(T("달늑대 도전 해금 · 더 준비해도 좋습니다","Moonwolf unlocked · Challenge when ready","銀月の狼が解放 · 準備して挑もう"));}
  if(BossActive)return;State.stage=!State.mainAccepted?AdventureStage.Offer:State.relicRewards>0?AdventureStage.Reward:!State.bossCleared?(State.bossUnlocked?AdventureStage.Gate:AdventureStage.Road):State.sideActive==0?AdventureStage.Herbs:State.sideActive==1?AdventureStage.Elite:State.sideDone==3?AdventureStage.Complete:AdventureStage.Camp;
 }
 public void TalkGuide(){RpgUI.Instance.Open(RpgUI.Window.Adventure);}
 public bool AcceptMain(){if(State.mainAccepted)return false;State.mainAccepted=true;RefreshStory();ApplyWorld();Save();return true;}
 public void AddEssence(int count){State.essence=(int)Math.Min(999999L,(long)State.essence+Mathf.Max(0,count));}
 public bool SpendEssence(int count){if(count<0||State.essence<count)return false;State.essence-=count;return true;}
 public void EnemyDefeated(SlimeMonster enemy){if(!Ready||!enemy||enemy.isBoss||!enemy.IsDead)return;if(counted.TryGetValue(enemy,out int life)&&life==enemy.TimesDefeated)return;counted[enemy]=enemy.TimesDefeated;State.kills=Mathf.Min(999999,State.kills+1);int points=enemy.isElite?5:enemy.isBee?2:1;State.survey=Mathf.Min(80,State.survey+points);if(State.bossCleared)State.retry=Mathf.Min(20,State.retry+points);AddEssence((enemy.isElite?8:enemy.isBee?2:1)*State.danger);Quests.OnKill(enemy);RefreshStory();if(EventRunning&&GroupDead(EventKind==0?"elite":"swarm"))CompleteEvent();Save();}
 public void BossDefeated(){if(!BossActive)return;bool first=!State.bossCleared;corpseUntil=Time.time+1.2f;State.bossCleared=true;session.BossDefeated=true;State.clearedDangers|=1<<(State.danger-1);State.unlockedDanger=Mathf.Max(State.unlockedDanger,Mathf.Min(3,State.danger+1));State.retry=0;AddEssence(first?30:12*State.danger);if(first)AwardRelicReward();State.stage=AdventureStage.Camp;RefreshStory();RpgVFX.Heal(Arena);RpgUI.Toast(T("숲의 저주가 걷혔습니다 · L에서 다음 모험 확인","The curse lifts · L for your next adventure","呪いが解けた · Lで次の冒険へ"));ApplyWorld();Save();}
 void AwardRelicReward(){if(Relics.State.owned==7)AddEssence(30);else State.relicRewards=Mathf.Min(3,State.relicRewards+1);}
 public bool ChooseRelic(int id){if(State.relicRewards<=0||!CanManage||!Relics.Award(id))return false;State.relicRewards--;State.completionNotice=false;RefreshStory();ApplyWorld();ForestSound.Play("upgrade");Save();return true;}
 public bool AcceptSide(int id){if(!State.bossCleared||State.sideActive>=0||id<0||id>1||(State.sideDone&(1<<id))!=0)return false;State.sideActive=id;RefreshStory();ApplyWorld();Save();return true;}
 void CompleteSide(int id){State.sideDone|=1<<id;State.sideActive=-1;AwardRelicReward();RefreshStory();ApplyWorld();RpgUI.Toast(T("의뢰 완료 · 보상이 수첩에 보관됩니다","Request complete · Reward stored in journal","依頼完了 · 報酬は手帳へ"));Save();}
 public bool CanChallenge=>State.bossUnlocked&&!BossActive&&!EventRunning&&(!State.bossCleared||State.retry>=20);
 public bool EnterBoss(){if(!CanChallenge||!CanManage||ClassCombat.Flat(player.transform.position-Gate).magnitude>3)return false;State.stage=AdventureStage.Boss;ApplyWorld();MoonwolfEvent.Instance.SummonAt(Arena);var h=MoonwolfEvent.Instance.boss.GetComponent<SlimeMonster>();h.maxHealth=Mathf.RoundToInt(1400*(1+(State.danger-1)*.6f));h.damageMultiplier=1+(State.danger-1)*.25f;h.ResetMonster();Save();return true;}
 public bool CanManage=>!player.IsDead&&!BossActive&&!player.IsChanneling&&!player.IsCharging&&Time.time-lastDamage>=5&&!NearbyEnemy();
 bool NearbyEnemy(){foreach(var e in Enemies.Values)if(e&&e.gameObject.activeInHierarchy&&!e.IsDead&&ClassCombat.Flat(e.transform.position-player.transform.position).sqrMagnitude<49)return true;return false;}
 public bool AtRefuge=>ClassCombat.Flat(player.transform.position-Camp).magnitude<3||ClassCombat.Flat(player.transform.position-Gate).magnitude<3;
 public bool ChangeDanger(int tier){if(tier<1||tier>State.unlockedDanger||tier==State.danger||!CanManage||!AtRefuge||EventRunning)return false;State.danger=tier;Population.ChangeTier();Save();return true;}
 public bool StartEvent(int kind){if(EventRunning||BossActive||kind<0||kind>1||Time.time<eventReady)return false;Vector3 center=kind==0?Sites[0]:Herbs[1];if(ClassCombat.Flat(player.transform.position-center).magnitude>6)return false;EventKind=kind;foreach(var pair in Enemies.Where(e=>e.Key.StartsWith(kind==0?"elite":"swarm"))){var e=pair.Value;e.maxHealth=Mathf.RoundToInt((e.isElite?280:75)*(1+(State.danger-1)*.45f));e.damageMultiplier=1+(State.danger-1)*.22f;e.speed=kind==1?2.2f:1.8f;e.TestIdle=TestFreezeEnemies;e.gameObject.SetActive(true);e.ResetMonster();}Population.Tick();ForestSound.Play("boss_warning",center,.6f);Save();return true;}
 void CompleteEvent(){int kind=EventKind;EventKind=-1;eventReady=Time.time+60;AddEssence(8*State.danger);if((State.eventFirst&(1<<kind))==0){State.eventFirst|=1<<kind;State.survey=Mathf.Min(80,State.survey+5);}if(State.sideActive==1&&kind==0)CompleteSide(1);RefreshStory();RpgUI.Toast(T("지역 사건 완료 · 사냥을 계속할 수 있습니다","Event complete · Keep exploring","事件解決 · 探索を続けよう"));}
 public float EventCooldown=>Mathf.Max(0,eventReady-Time.time);
 public bool Interact(string id){if(!Ready||!NodeVisible(id)||player.IsDead||RpgUI.Blocking)return false;var node=nodes.FirstOrDefault(n=>n.Id==id);if(!node||ClassCombat.Flat(player.transform.position-node.transform.position).magnitude>2.4f)return false;
  if(id=="camp"||id=="gate"){if(!CanManage)return false;player.SetCheckpoint(id=="camp"?Camp:Gate);player.RestoreHealth();player.ProtectArrival();Save();RpgUI.Instance.OpenJournal(3);return true;}
  if(id=="elite"||id=="swarm")return StartEvent(id=="elite"?0:1);
  if(!CanManage){RpgUI.Toast(T("주변 적을 정리하고 이용하세요","Clear nearby enemies first","周囲の敵を倒してください"));return false;}
  if(id.StartsWith("site")){State.purified|=1<<(id[4]-'0');State.survey=Mathf.Min(80,State.survey+10);AddEssence(8);RpgVFX.Heal(node.transform.position);}else{State.herbs|=1<<(id[4]-'0');if(HerbCount==3)CompleteSide(0);}RefreshStory();ApplyWorld();Save();return true;
 }
 public void PlayerDamaged(){lastDamage=Time.time;}
 public void OnRespawn(){Relics.ClearTemporary();ResetEvents();if(BossActive){State.stage=AdventureStage.Gate;RefreshStory();ApplyWorld();}Save();}
 public bool CanReturnCamp=>CanManage;
 public bool ReturnCamp(){if(!CanReturnCamp)return false;player.SetCheckpoint(Camp);player.Respawn();Camera.main.GetComponent<PlaygroundView>().Snap();player.ProtectArrival();Save();return true;}
 void Update(){if(!Ready||!session.Playing)return;if(corpseUntil>0&&Time.time>=corpseUntil){corpseUntil=0;if(!BossActive)MoonwolfEvent.Instance?.ResetEncounter();}Shader.SetGlobalVector("_AdventureView",new Vector4(Arena.x,Arena.y,Arena.z,ClassCombat.Flat(player.transform.position-Arena).magnitude<12?1:0));if(Time.time>=nextScan){nextScan=Time.time+.2f;for(int i=0;i<3;i++)if(ClassCombat.Flat(player.transform.position-Regions[i]).magnitude<4)DiscoverRegion(i);Near=RpgUI.Blocking?null:nodes.Where(n=>n.gameObject.activeSelf&&ClassCombat.Flat(n.transform.position-player.transform.position).magnitude<2.4f).OrderBy(n=>(n.transform.position-player.transform.position).sqrMagnitude).FirstOrDefault();if(Near){float nodeDistance=Vector3.Distance(Near.transform.position,player.transform.position);foreach(var item in interactables)if(item&&!item.Collected&&item.gameObject.activeInHierarchy){float d=Vector3.Distance(item.transform.position,player.transform.position);if(d<item.Radius&&d<nodeDistance){Near=null;break;}}}}
  if(BossActive&&!player.IsDead&&ClassCombat.Flat(player.transform.position-Arena).magnitude>20){State.stage=AdventureStage.Gate;RefreshStory();ApplyWorld();Save();}
  if(EventRunning&&ClassCombat.Flat(player.transform.position-(EventKind==0?Sites[0]:Herbs[1])).magnitude>22){ResetEvents();eventReady=Time.time+15;}
  if(!player.TestControl&&Near&&!RpgUI.Blocking&&!RpgUI.MenuInputConsumed&&Input.GetKeyDown(KeyCode.E))Interact(Near.Id);
 }
 public Vector3 Target=>!State.mainAccepted?Guide:BossActive?Arena:State.bossUnlocked&&!State.bossCleared?Gate:State.sideActive==0?nodes.Where(n=>n.Id.StartsWith("herb")&&n.gameObject.activeSelf).Select(n=>n.transform.position).DefaultIfEmpty(Herbs[0]).First():State.sideActive==1?Sites[0]:Regions.FirstOrDefault(v=>(State.regions&(1<<Array.IndexOf(Regions,v)))==0)==Vector3.zero?Regions[1]:Regions.First(v=>(State.regions&(1<<Array.IndexOf(Regions,v)))==0);
 public string Objective=>!State.mainAccepted?T("루미에게 숲 조사 의뢰 받기","Speak to Lumi about the forest","ルミから森の調査依頼を受ける"):BossActive?T("은빛 달늑대의 저주 풀기","Break the Moonwolf's curse","銀月の狼の呪いを解く"):!State.introComplete?T("어떤 적이든 처치 ","Hunt any enemies ","敵を倒す ")+Mathf.Min(State.kills,5)+" / 5":!State.bossUnlocked?T("숲 조사 ","Forest survey ","森の調査 ")+State.survey+" / 80 · "+RegionCount+" / 2 "+T("구역","regions","地域"):!State.bossCleared?T("달늑대 도전 가능 · 권장 Lv.6–8","Moonwolf ready · Suggested Lv.6–8","銀月の狼に挑戦可能 · 推奨Lv.6–8"):T("자유 탐사 · 위험 단계 ","Free exploration · Danger ","自由探索 · 危険度 ")+State.danger;
 public string Hint=>Quests.TrackedLabel;
 void OnDestroy(){if(Instance==this){Instance=null;Shader.SetGlobalVector("_AdventureView",Vector4.zero);Shader.SetGlobalVector("_AdventureClearing",Vector4.zero);Shader.SetGlobalVector("_AdventureSiteA",Vector4.zero);Shader.SetGlobalVector("_AdventureSiteB",Vector4.zero);}foreach(var n in nodes)if(n)Destroy(n.gameObject);foreach(var e in Enemies.Where(e=>!e.Key.StartsWith("wild")))if(e.Value)Destroy(e.Value.gameObject);}
}
}
