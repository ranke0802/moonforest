import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticBurstBudget} from '../src/diagnostic-burst-budget.js';

test('ordinary stalls cannot exhaust later minutes or the critical reserve',()=>{
 const budget=new DiagnosticBurstBudget();
 assert.equal(budget.take(100,false),500);assert.equal(budget.take(500,false),0);
 assert.equal(budget.take(59000,true),250);assert.equal(budget.take(59500,true),250);assert.equal(budget.take(59600,true),0);
 assert.equal(budget.take(300001,false),500);assert.equal(budget.take(419000,true),250);
 assert.equal(budget.take(599900,true),100);assert.equal(budget.take(600000,true),0);
});

test('ten-minute total reserved detailed time is no more than ten seconds',()=>{
 const budget=new DiagnosticBurstBudget();let total=0;
 for(let minute=0;minute<10;minute++){total+=budget.take(minute*60000,false);total+=budget.take(minute*60000+1000,true);total+=budget.take(minute*60000+2000,true);}
 assert.equal(total,10000);assert.equal(budget.take(-1,true),0);assert.equal(budget.take(NaN,true),0);
});
