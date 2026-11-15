// Budgets for optional review effects. These are bounded content presets, not
// a claim that a particular phone can sustain a measured FPS.
export const EFFECT_PROFILES=Object.freeze({
 compact:Object.freeze({particles:256,bursts:4,decorations:12,coverage:1.2}),
 standard:Object.freeze({particles:768,bursts:6,decorations:32,coverage:2.2}),
 rich:Object.freeze({particles:2048,bursts:8,decorations:64,coverage:3.2}),
});
export class EffectBudget{
 constructor(mode='standard'){this.mode=EFFECT_PROFILES[mode]?mode:'standard';this.entries=new Map();this.serial=0;this.stats={requests:0,accepted:0,rejected:0,decorationReductions:0,peakBursts:0,peakParticles:0};}
 setMode(mode){if(EFFECT_PROFILES[mode])this.mode=mode;}
 acquire(time,{coverage=0,duration=1.1}={}){
  this.releaseExpired(time);this.stats.requests++;const p=EFFECT_PROFILES[this.mode];let used=0,area=0;
  for(const row of this.entries.values()){used+=row.slots;area+=row.coverage;}
  // Review bursts are entirely cosmetic. A full budget never delays gameplay
  // or suppresses an existing telegraph; the preview request is simply refused.
  if(this.entries.size>=p.bursts||used+4>p.particles){this.stats.rejected++;return null;}
  const remaining=Math.max(0,p.coverage-area),cost=Math.max(.001,Number.isFinite(coverage)?coverage:1);
  const decorations=Math.max(0,Math.min(p.decorations,p.particles-used-4,Math.floor(p.decorations*Math.min(1,remaining/cost))));
  const row={id:++this.serial,expires:time+duration,slots:4+decorations,decorations,coverage:Math.min(p.coverage,cost)};this.entries.set(row.id,row);this.stats.accepted++;
  if(decorations<p.decorations)this.stats.decorationReductions++;this.stats.peakBursts=Math.max(this.stats.peakBursts,this.entries.size);this.stats.peakParticles=Math.max(this.stats.peakParticles,used+row.slots);return row;
 }
 releaseExpired(time){for(const [id,row]of this.entries)if(time>=row.expires)this.entries.delete(id);}
 clear(){this.entries.clear();}
 inspect(){let particles=0,coverage=0;for(const e of this.entries.values()){particles+=e.slots;coverage+=e.coverage;}return {...this.stats,mode:this.mode,activeBursts:this.entries.size,activeSlots:particles,coverageEstimate:coverage,scope:'optional review effects; screen-area estimate, not GPU time'};}
}
