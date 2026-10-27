const desktop=Object.freeze({fogStart:88,fogEnd:105,cellCull:110,meshCull:118,maxCameraRadius:82});
const mobile=Object.freeze({fogStart:65,fogEnd:80,cellCull:82,meshCull:90,maxCameraRadius:56});
export const villageRenderRange=touch=>touch?mobile:desktop;
