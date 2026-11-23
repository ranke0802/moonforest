// Game-side subset of the R10 (feral) wolf clips. The source file keeps all
// four approved clips for review and history (wolf-v02-authored-history.js);
// the published game plays only the two orbit steps, so only they ship in the
// game bundle (2026-11-23: the two retired bites were 0.5 MB of parsed JS).
// Regenerate with: node scripts/wolf-v02-live-clips.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const WOLF_V02_FERAL_LIVE_NAMES=Object.freeze(['Wolf_Orbit_Step_V02','Wolf_Orbit_Step_Left_V02']);
const source=new URL('../src/wolf-v02-feral-clips.json',import.meta.url),target=new URL('../src/wolf-v02-feral-live-clips.json',import.meta.url);

// Same header and the same clip objects in the source order; nothing is resampled.
export function feralLiveClipsText(text=readFileSync(source,'utf8')){
 const data=JSON.parse(text),out={};
 for(const [key,value] of Object.entries(data))out[key]=key==='clips'?value.filter(clip=>WOLF_V02_FERAL_LIVE_NAMES.includes(clip.name)):value;
 out.liveSubset={of:'wolf-v02-feral-clips.json',clips:out.clips.map(clip=>clip.name)};
 return JSON.stringify(out)+'\n';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){writeFileSync(target,feralLiveClipsText());console.log('wrote',fileURLToPath(target));}
