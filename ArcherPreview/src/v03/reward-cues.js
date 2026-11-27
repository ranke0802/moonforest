// Sound places for reward moments (2026-11-27). Each moment has an event name; a name
// maps to a game cue (public/assets/audio.json "sounds") or to null = silent.
// New sounds are joined only after the user approves a candidate
// (.cache/handoff/opus-wip/1127-audio-candidates/README.md): add the file to audio.json
// under the cue name, then put that name here. Quest completion already plays
// 'gold_pickup' in story.js announceReward(); that stays as it is.
export const REWARD_CUES=Object.freeze({
 levelup:null,
 'quest:complete':null,
});
export function playRewardCue(event,play,cues=REWARD_CUES){
 const cue=Object.hasOwn(cues,event)?cues[event]:null;
 if(!cue||typeof play!=='function')return false;
 try{play(cue,{volume:.9});return true;}catch{return false;}
}
