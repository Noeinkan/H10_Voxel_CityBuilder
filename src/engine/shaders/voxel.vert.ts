import { MESH_UNITS_PER_VOXEL } from '../mesher/meshTypes';

/**
 * Vertex shader del voxel.
 *
 * Non calcola luce: indice di palette e di faccia sono costanti sui quattro
 * vertici di un quad, quindi i varying non interpolano niente e lo shading resta
 * piatto. La luce si fa nel fragment, dove servono l'ombra proiettata e il
 * jitter per voxel, che sono entrambi per-pixel.
 */
export const vertexShader = /* glsl */ `
attribute float aFace;
attribute float aPalette;
attribute float aSurface;
attribute float aShade;

uniform float uVoxelSize;
uniform float uAoStrength;

varying float vAO;
varying float vOcclusion;
varying float vSkyVisibility;
varying float vGlow;
varying float vFogDepth;
varying float vPaletteIndex;
varying float vFaceIndex;
varying float vSurfaceIndex;
varying vec2 vWorldXY;
varying vec3 vWorldPosition;

void main() {
  // position arriva come Int16 in sedicesimi di voxel, incluse le sporgenze.
  //
  // aShade porta tre campi geometrici in un byte: l'AO per corner nei due bit
  // bassi, la visibilita' del cielo nei due successivi, il bagliore di una
  // faccia emissiva vicina nei due dopo ancora. Senza operatori bit, che in
  // GLSL ES 1.00 non ci sono: mod e floor su interi piccoli sono esatti in
  // float. Il mod sul cielo non e' ornamentale: senza, leggerebbe anche i bit
  // del bagliore e una parete illuminata si crederebbe scoperta.
  float occlusion = mod(aShade, 4.0) / 3.0;
  vAO = mix(1.0 - uAoStrength, 1.0, occlusion);
  vOcclusion = 1.0 - occlusion;
  vSkyVisibility = mod(floor(aShade / 4.0), 4.0) / 3.0;
  vGlow = floor(aShade / 16.0) / 3.0;

  vec4 worldPosition = modelMatrix * vec4(position * (uVoxelSize / ${MESH_UNITS_PER_VOXEL}.0), 1.0);
  vPaletteIndex = aPalette;
  vFaceIndex = aFace;
  vSurfaceIndex = aSurface;
  vWorldXY = worldPosition.xy;
  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;
