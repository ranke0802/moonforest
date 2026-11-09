// Manual summon counts are per species/phase. Developer actor/cinematic budgets
// keep their separate population and memory policies.
export const MAX_SUMMON_PER_KIND = 20;
export function normalizeSummonCount(value) {
  const count=Number(value);
  return Number.isFinite(count)?Math.max(1,Math.min(MAX_SUMMON_PER_KIND,Math.floor(count))):1;
}
