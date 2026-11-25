// Each pose key pairs encounter seconds with a normalized position in that rig's
// fitted Attack clip. The club has a high wind-up and a broad forehand late in
// its clip. The cleaver crosses in front at .38 and returns across the body at .63.
// A pass has its own contact, like the warrior's thrust and follow-cut.
export const CHAPTER_BOSS_ATTACKS={
 'hobgoblin-boss':[
  {id:'club-crush',reach:1,facing:.65,
   poses:[[0,.06],[.42,.18],[.68,.19],[.88,.25],[1.13,.26],[1.76,.30]],
   hits:[{at:.88,power:1.15,heavy:true}]},
  {id:'club-sweep',reach:1.13,facing:.25,
   poses:[[0,.56],[.37,.65],[.69,.74],[.93,.82],[1.52,.94]],
   hits:[{at:.93,power:.95}]},
  {id:'club-double',reach:1.05,facing:.48,
   poses:[[0,.27],[.40,.35],[.58,.37],[.79,.50],[1.05,.62],[1.28,.72],[1.57,.82],[2.42,1]],
   hits:[{at:.79,power:.82},{at:1.57,power:1.1,heavy:true}]},
 ],
 'ghoul-warrior':[
  {id:'cleaver-cut',reach:1,facing:.48,
   poses:[[0,0],[.29,.25],[.48,.38],[.67,.45],[1.06,.50]],
   hits:[{at:.48,power:1}]},
  {id:'cleaver-lunge',reach:1.03,startReach:1.48,facing:.68,step:{from:.30,to:.57,metres:.72},
   poses:[[0,.04],[.29,.22],[.43,.30],[.57,.38],[.83,.44],[1.04,.55],[1.30,.63],[1.94,1]],
   hits:[{at:.57,power:.86},{at:1.30,power:1}]},
  {id:'cleaver-counter',reach:1.07,facing:.52,guard:{from:.21,to:.68},
   poses:[[0,.42],[.21,.52],[.68,.55],[.82,.57],[1.02,.64],[1.70,1]],
   hits:[{at:1.02,power:1.18,heavy:true}]},
 ],
};
