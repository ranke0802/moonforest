// Post-fix regression check. The earlier owner-audit-evidence.json is historical
// evidence; write results separately so the before/after record stays intact.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {releaseStorage} from '../../../ArcherPreview/src/release-storage.js';
import {MOONFOREST_RELEASE_V2} from '../../../ArcherPreview/src/release-route.js';
import {ChapterJourney,CHAPTER_SAVE} from '../../../ArcherPreview/src/chapter-quest-state.js';
import {GoldLoot} from '../../../ArcherPreview/src/gold-loot.js';
const memory=(entries=[])=>{const values=new Map(entries);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
const blocked=new ChapterJourney(releaseStorage(undefined,MOONFOREST_RELEASE_V2));
blocked.collect('gold',1,'audit-only');assert.equal(blocked.volatile,true);
const brokenStorage=memory([[CHAPTER_SAVE,'{broken']]);
const broken=new ChapterJourney(brokenStorage);broken.save();
assert.equal(brokenStorage.getItem(CHAPTER_SAVE),'{broken');
const versionStorage=memory([[CHAPTER_SAVE,JSON.stringify({version:999,bag:{gold:4321}})]]);
const version=new ChapterJourney(versionStorage);version.save();assert.equal(version.value.bag.gold,undefined);
assert.equal(JSON.parse(versionStorage.getItem(CHAPTER_SAVE)).version,999);
const shared=memory(),tabA=new ChapterJourney(shared),tabB=new ChapterJourney(shared);
tabA.collect('gold',10,'tab-a');tabB.collect('gold',20,'tab-b');
assert.equal(JSON.parse(shared.getItem(CHAPTER_SAVE)).bag.gold,10);assert.equal(tabB.saveState,'conflict');
const goldStorage=memory(),journey=new ChapterJourney(goldStorage),gold=new GoldLoot({storage:goldStorage});
journey.recordDefeatReward('kill:goblin',{gold:100000});
const firstCredit=gold.creditCumulative('chapter-audit',journey.value.bag.gold);
journey.recordDefeatReward('kill:goblin',{gold:25});
const secondCredit=gold.creditCumulative('chapter-audit',journey.value.bag.gold);
assert.equal(firstCredit,100000);assert.equal(secondCredit,25);
const result={date:'2026-11-17',method:'Direct Node imports; synthetic in-memory storage only',
 noRealSaveModified:true,noGameSourceModified:true,browserAutomation:false,
 unavailableStorage:{underlyingStorage:null,reportedVolatile:blocked.volatile,inMemoryGold:blocked.value.bag.gold},
 corruptSave:{original:'{broken',afterSave:brokenStorage.getItem(CHAPTER_SAVE),preserved:true},
 unsupportedVersion:{originalVersion:999,afterSaveVersion:JSON.parse(versionStorage.getItem(CHAPTER_SAVE)).version,originalGoldPreserved:true},
 concurrentSnapshots:{firstTabGold:10,secondTabGold:20,persistedGold:10,secondTabStatus:tabB.saveState,merged:false},
 cumulativeGold:{firstReward:100000,nextReward:25,firstCredit,nextCredit:secondCredit,afterChapterTotal:journey.value.bag.gold,policyIntentUnknown:true},
 limitations:['These are conditional code-path reproductions, not evidence a user has lost data.','No assertion of a deployed-browser failure rate or financial loss.','The intended gold cap and multi-tab policy are not defined by these checks.']};
writeFileSync(resolve(import.meta.dirname,'owner-improvement-evidence.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({unavailableStorageMarkedUnsaved:true,corruptAndFutureVersionPreserved:true,staleTabRefused:true,newGoldAfterCapCredited:true,realSaveTouched:false}));
