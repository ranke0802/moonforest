import {AmbientView} from './ambient-view.js';
import {withinRenderRange} from './world-limits.js';

export class AmbientMonsterUpdates {
  view = new AmbientView();
  constructor(world) { this.world = world; }

  hidden(boss) {
    const view=this.view, p=boss.actor.position;
    if(!view.valid)return false;
    // The native range gate retires both the geometry and its shadow.
    if(!withinRenderRange(view.camera.globalPosition,p,(boss.renderRangePadding??3)+3))return true;
    return view.hidden(p.x,p.y+1,p.z,Math.max(5,3+2*boss.radius));
  }

  step(boss, player, dt, slot) {
    const period=boss.active&&!boss.storyHold?boss.ambientUpdatePeriod(player):0;
    const pending=boss._ambientPending??0;
    if(!period||!this.hidden(boss)){
      boss._ambientWake=!!boss._ambientSleeping;
      boss._ambientSleeping=false;boss._ambientPending=0;
      // An alert or attack starts now. Never feed peaceful time to a combat timer.
      return dt+(period?pending:0);
    }
    if(!boss._ambientSleeping){
      boss._ambientNext=period*(.25+.75*((slot*.61803398875)%1));
      boss._ambientSleeping=true;
    }
    this.hasSleepers=true;
    boss._ambientPending=pending+dt;
    if(boss._ambientPending+1e-7<Math.min(period,boss._ambientNext))return null;
    const elapsed=boss._ambientPending;
    boss._ambientPending=0;boss._ambientNext=period;
    return elapsed;
  }

  // Orbit input and camera follow can change the view after the gameplay tick.
  beforeDraw(battle) {
    if(!this.hasSleepers||!battle.active||!battle.currentPlayer)return;
    this.view.prepare(this.world);
    for(const boss of battle.encounters){
      if(!boss._ambientSleeping||!boss.active||boss.storyHold||this.hidden(boss))continue;
      const dt=boss.ambientUpdatePeriod(battle.currentPlayer)?boss._ambientPending:0;
      boss._ambientPending=0;boss._ambientSleeping=false;boss._ambientWake=true;
      try{
        boss.update(dt,battle.currentPlayer);
        if(this.view.valid)boss.updateRenderRange(this.view.camera.globalPosition);
        boss.alignPose();
      }finally{boss._ambientWake=false;}
    }
  }
}
