const clips=Object.freeze({idle:'Idle',walk:'Walk',attack:'Attack',hit:'Hit',death:'Death'});
export const CHAPTER_MONSTER_MODELS=Object.freeze({
  'goblin-warrior':Object.freeze({url:new URL('./models/chapter-foes/goblin-warrior.glb',import.meta.url),height:1.36,clips}),
  'goblin-shaman':Object.freeze({url:new URL('./models/chapter-foes/goblin-shaman.glb',import.meta.url),height:1.39,clips}),
  'goblin-archer':Object.freeze({url:new URL('./models/chapter-foes/goblin-archer.glb',import.meta.url),height:1.31,clips}),
  'hobgoblin-boss':Object.freeze({url:new URL('./models/chapter-foes/hobgoblin-boss.glb',import.meta.url),height:1.98,clips}),
  'ghoul-warrior':Object.freeze({url:new URL('./models/chapter-foes/ghoul-warrior.glb',import.meta.url),height:1.79,clips}),
  'zombie':Object.freeze({url:new URL('./models/chapter-foes/zombie.glb',import.meta.url),height:1.71,clips}),
});
