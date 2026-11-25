// Extremal vertices of each boot (Foot/Toe-weighted surface) on the shipped bodies.
const warriorSoles=[2961,5017,2591,6623,3567,6124,6296,3574,3490,3579,5189,2565,4767,6696,3590,6069,6123,3362,3569,6434,3582];
const archerSoles=[2795,2920,2701,6262,2813,5872,5424,4675,2810,2793,2465,4459,5906,2819,5377,5737,2815,2796,2652,124];
const shamanSoles=[5600,6121,1549,6792,3788,6134,5969,3617,6115,5480,1285,5227,6822,3789,6120,5560,3723,5996];
const clips=Object.freeze({idle:'Idle',walk:'Walk',attack:'Attack',hit:'Hit',death:'Death'});
export const CHAPTER_MONSTER_MODELS=Object.freeze({
  'goblin-warrior':Object.freeze({url:new URL('./models/chapter-foes/goblin-warrior.glb',import.meta.url),height:1.36,soleVertices:warriorSoles,clips}),
  'goblin-shaman':Object.freeze({url:new URL('./models/chapter-foes/goblin-shaman.glb',import.meta.url),height:1.39,soleVertices:shamanSoles,clips}),
  'goblin-archer':Object.freeze({url:new URL('./models/chapter-foes/goblin-archer.glb',import.meta.url),height:1.31,soleVertices:archerSoles,clips}),
  'hobgoblin-boss':Object.freeze({url:new URL('./models/chapter-foes/hobgoblin-boss.glb',import.meta.url),height:1.98,clips}),
  'ghoul-warrior':Object.freeze({url:new URL('./models/chapter-foes/ghoul-warrior.glb',import.meta.url),height:1.79,clips}),
  'zombie':Object.freeze({url:new URL('./models/chapter-foes/zombie.glb',import.meta.url),height:1.71,clips}),
});
