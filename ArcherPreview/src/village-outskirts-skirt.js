// The existing floor stretches its outermost row past the playable village.
// Lower only that far row beneath the reciprocal terrain patch. The original
// village height field, walking surface and triangle count stay unchanged.
export const villageOutskirtsSkirtHeight=(x,z,height)=>z>80&&Math.abs(x)<=41?Math.min(height,-.5):height;
