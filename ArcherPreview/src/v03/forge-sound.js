// Where the forge bench makes sound (2026-11-27). Event names are fixed; each maps to
// a cue the game already plays, or to null until a candidate sound is approved. To
// connect an approved sound, add its cue to assets/audio.json and change one line here.
export const FORGE_SOUNDS=Object.freeze({
 'forge:ambience':null,// bench fire and bellows (candidate pending)
 'forge:ambience:end':null,
 'forge:strike:perfect':Object.freeze(['parry',{volume:1}]),
 'forge:strike:success':Object.freeze(['block',{volume:.9}]),
 'forge:strike:near':Object.freeze(['block',{volume:.55,rate:.88}]),
 'forge:strike:failed':Object.freeze(['land',{volume:.75,rate:.8}]),
 'forge:result:perfect':Object.freeze(['critical',{volume:.9}]),
 'forge:result:success':null,'forge:result:near':null,'forge:result:failed':null,
});
// play(cue, options): the game's sound hook. Returns the cue played, or null.
export function forgeSound(play,event){
 const cue=FORGE_SOUNDS[event];
 if(!cue||typeof play!=='function')return null;
 try{play(cue[0],cue[1]);}catch{return null;}
 return cue[0];
}
