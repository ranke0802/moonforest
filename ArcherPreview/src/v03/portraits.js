// Upper-body concept art shown beside the dialogue box. Files live next to
// this module so the bundler hashes and ships them with the game code.
const url=name=>new URL(`./portraits/${name}.webp`,import.meta.url).href;
export const PORTRAITS=Object.freeze({
 hero:url('hero'),joachim:url('joachim'),vivian:url('vivian'),elder:url('elder'),herbalist:url('herbalist'),
 youth:url('youth'),innkeeper:url('innkeeper'),driver:url('driver'),farmer:url('farmer'),
});
// Speaker label → portrait. Placeholder casting until each role has its own
// art: driver = blacksmith sheet, chief = merchant sheet, innkeeper = farmer sheet.
export const SPEAKER_PORTRAITS=Object.freeze({
 '나':'hero','마부':'driver','여관 주인':'farmer','노년 여성':'elder','약초사':'herbalist','청년':'youth','촌장':'innkeeper','요아힘':'joachim','비비앙':'vivian',
});
export const portraitFor=who=>PORTRAITS[SPEAKER_PORTRAITS[who]]??null;
