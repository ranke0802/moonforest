// Single place for 0.3 edition identity. Shared runtime files branch on this,
// never on the entry file name.
export {MOONFOREST_EDITION_V3 as EDITION_V3,MOONFOREST_EDITION_V3_LABEL as EDITION_V3_LABEL} from '../release-route.js';
export const isV03=value=>value==='moonforest-0.3';
