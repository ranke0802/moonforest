import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const main=read('fox-moving-proof.json'),side=read('fox-moving-side-cooldown-proof.json');
assert.equal(main.baselineSourceSha256,'d4096aa42f87ec952c5aefd327870995427b3afd44bfa6b00885ee22de4a900b');
assert.equal(main.candidateFileUnchangedDuringRun,true);assert.equal(side.candidateFileUnchangedDuringRun,true);assert.equal(main.candidateSourceSha256AtStart,side.candidateSourceSha256AtStart);
const candidate=[...main.results,...side.results].filter(row=>row.version==='R3-neck-yaw');
for(const row of candidate){
 assert.equal(row.jointInvariants.checked.length,6);assert.equal(row.jointInvariants.position,0);assert.equal(row.jointInvariants.scale,0);assert.equal(row.jointInvariants.restore,0);
 assert.ok(row.rows.every(frame=>frame.neckPoseDriftMeters<1e-8),'aim and actual receiving pose must agree');
}
for(const id of ['standing-front','moving-front','moving-side-cooldown']){
 const row=candidate.find(row=>row.case.id===id);assert.ok(row);assert.equal(row.actions.length,2);assert.deepEqual(row.actions.map(a=>a.state),['slash','attack']);assert.ok(row.actions.every(a=>a.damage>0),'both actual normal actions contact an in-range fox');
}
const outside=candidate.find(row=>row.case.id==='outside');assert.equal(outside.actions.length,2);assert.ok(outside.actions.every(a=>a.damage===0));
const interrupted=candidate.find(row=>row.case.id==='moving-side');assert.equal(interrupted.actions.length,1);assert.ok(interrupted.staggerFrames>0,'native receiving interruption must remain real');
const old=main.results.find(row=>row.version==='R2-root-pitch'&&row.case.id==='standing-front');assert.equal(old.actions[1].damage,0);assert.ok(old.actions[1].windows.thrust.minimumGap>0);
console.log(JSON.stringify({pass:true,bothNormalActionsHitInThreeReceivingCases:true,outsideBothMiss:true,intentionalPlayerStaggerPreserved:true,finalNeckPoseDriftMeters:0,jointLocalOffsetsScalesAndRestoreExact:true,candidateSha256:main.candidateSourceSha256AtStart}));
