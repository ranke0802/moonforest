// Node/offline review exports. Never import this module from game runtime.
import data from './wolf-v02-attack-clips.json' with {type:'json'};
import feral from './wolf-v02-feral-clips.json' with {type:'json'};
import predator from './wolf-v02-predator-clips.json' with {type:'json'};
import ram from './wolf-v02-ram-clips.json' with {type:'json'};
import combatR13 from './wolf-v02-combat-r13-clips.json' with {type:'json'};
export const WOLF_V02_R9_CLIPS=data.clips;
export const WOLF_V02_RAM_CLIPS=ram.clips;
export const WOLF_V02_ALL_AUTHORED_CLIPS=[...data.clips,...feral.clips,...predator.clips,...ram.clips,...combatR13.clips];
if(ram.sourceSha256!==feral.sourceSha256)throw Error('Historical R12 motion requires the approved R8 rig');
