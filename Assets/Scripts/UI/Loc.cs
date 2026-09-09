using UnityEngine;
using System.Collections.Generic;
namespace WitchPlayground {
public static class Loc {
 public static int Language;public static bool English{get=>Language==1;set=>Language=value?1:0;}
 public static string LanguageName=>Language==0?"한국어":Language==1?"English":"日本語";
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]static void Reset(){Language=PlayerPrefs.GetInt("WitchRPG.Language",0);}
 public static string T(string ko,string en,string ja=null)=>Language==0?ko:Language==1?en:ja??(Japanese.TryGetValue(ko,out string text)?text:en);
 public static void Toggle(){Language=(Language+1)%3;RpgUI.ClearToast();}
 static readonly Dictionary<string,string> Japanese=new Dictionary<string,string>{
 {"에너지 볼","エナジーボール"},{"서리 파동","氷の刃"},{"유성 낙하","メテオ"},{"초록빛 회복","緑の癒し"},
 {"가방에서 마법서를 장착하세요.","バッグから武器を装備してください。"},{"마나가 부족합니다.","MPが足りません。"},{"레벨업 선택으로 배우는 스킬입니다.","レベルアップで習得できます。"},{"경험치","経験値"},
 {"새 스킬 · ","新スキル · "},{"스킬 강화 · ","スキル強化 · "},{"기본 공격 · 시전 가속","通常攻撃 · 加速"},{"기본 공격 · 위력 강화","通常攻撃 · 強化"},{"마력의 그릇","魔力の器"},
 {"새로운 마법을 배우고 단축키로 사용할 수 있습니다.","新しい魔法を習得します。"},{"선택한 스킬의 위력 또는 회복량이 증가합니다.","スキルの威力を強化します。"},{"충전과 기본 공격 시전 속도 +10%","チャージと通常攻撃速度 +10%"},{"기본 공격 피해 +12%","通常攻撃ダメージ +12%"},{"최대 체력 +15, 최대 마나 +10","最大HP +15、最大MP +10"},
 {"젤리 슬라임","ゼリースライム"},{"꿀날개 벌","ハニービー"},{"낡은 마차 · 휴식","古い馬車 · 休憩"},{"숲길 안내판","森の案内板"},{"별빛 마법서","星明かりの魔導書"},{"브램 · 숲의 약사","ブラム · 森の薬師"},{"루미 · 숲길 안내자","ルミ · 森の案内人"},
 {"체력과 마나를 회복했어요. 돌아올 지점도 저장했어요. R키로 이곳으로 돌아오세요.","HPとMPが回復しました。復帰地点を保存しました。Rキーで戻れます。"},
 {"잠시 쉬어 가세요. 체력과 마나를 모두 회복해 드렸어요.","少し休みましょう。HPとMPを全回復しました。"}
 };
}
}
