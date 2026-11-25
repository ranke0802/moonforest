// The original village smith's opaque 4096² colour atlas, encoded with all 13 mips.
export const SMITH_COLOR_JPG='53b9e5b9092576bcca7be489a4b6da13088b59402640b74efb5a0c13dd313425.jpg';
export const SMITH_COLOR_KTX2='a6e082a15ccf21408ad2cc6486b9e50f895ceee5f6d9d57748cf80e6f5305ac7.ktx2';

export function smithTextureTier(caps){
  return caps?.maxTextureSize>=4096&&(caps.astc||caps.bptc)?{[SMITH_COLOR_JPG]:SMITH_COLOR_KTX2}:{};
}
