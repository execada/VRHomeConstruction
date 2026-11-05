/**
 * Текстура без видимых повторов для больших поверхностей (газон до горизонта, терраса):
 * плитка выбирается из двух «виртуальных» сдвигов по плавному шуму (приём И. Кильеса),
 * карты цвета, нормалей и шероховатости сдвигаются одинаково, а крупные пятна яркости
 * убирают однородность на сотнях метров. Цвет можно перекрасить по яркости в оттенок
 * со снимка (siteTint, доля siteTintMix) — газон совпадает с травой панорамы.
 * Патч для onBeforeCompile MeshStandardMaterial.
 * @module editor-3d/lib/noTileShader
 */

import { ShaderChunk } from 'three';

const FUNCTIONS = /* glsl */ `
uniform vec3 siteTint;
uniform float siteTintMix;
uniform float siteMeanLuma;
float siteHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float siteNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( siteHash( i ), siteHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( siteHash( i + vec2( 0.0, 1.0 ) ), siteHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
vec2 siteOffA;
vec2 siteOffB;
float siteMix;
void siteSetup( vec2 uv ) {
  float index = siteNoise( uv * 0.11 ) * 8.0;
  float i = floor( index );
  siteOffA = sin( vec2( 3.0, 7.0 ) * i );
  siteOffB = sin( vec2( 3.0, 7.0 ) * ( i + 1.0 ) );
  siteMix = smoothstep( 0.2, 0.8, fract( index ) );
}
vec4 siteSample( sampler2D tex, vec2 uv ) {
  vec2 dx = dFdx( uv );
  vec2 dy = dFdy( uv );
  return mix( textureGrad( tex, uv + siteOffA, dx, dy ), textureGrad( tex, uv + siteOffB, dx, dy ), siteMix );
}
`;

const MAP = /* glsl */ `
#ifdef USE_MAP
  siteSetup( vMapUv );
  vec4 siteTexel = siteSample( map, vMapUv );
  float siteLuma = dot( siteTexel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 siteRecolored = siteTint * ( siteLuma / max( siteMeanLuma, 1e-3 ) );
  diffuseColor.rgb *= mix( siteTexel.rgb, siteRecolored, siteTintMix );
  diffuseColor.a *= siteTexel.a;
  diffuseColor.rgb *= mix( 0.82, 1.12, siteNoise( vMapUv * 0.017 ) );
#endif
`;

const ROUGHNESS_SAMPLE = 'texture2D( roughnessMap, vRoughnessMapUv )';
const NORMAL_SAMPLE = 'texture2D( normalMap, vNormalMapUv )';

/**
 * Пропатчить фрагментный шейдер стандартного материала.
 * @param source - исходный фрагментный шейдер (с #include, до их раскрытия)
 * @returns шейдер с выборкой без повторов; если three.js изменил куски — исходный текст
 */
export function noTileFragment(source: string): string {
  const roughness = ShaderChunk.roughnessmap_fragment;
  const normal = ShaderChunk.normal_fragment_maps;
  if (!roughness.includes(ROUGHNESS_SAMPLE) || !normal.includes(NORMAL_SAMPLE) || !source.includes('#include <map_fragment>')) return source;
  return source
    .replace('#include <common>', `#include <common>\n${FUNCTIONS}`)
    .replace('#include <map_fragment>', MAP)
    .replace('#include <roughnessmap_fragment>', roughness.replace(ROUGHNESS_SAMPLE, 'siteSample( roughnessMap, vRoughnessMapUv )'))
    .replace('#include <normal_fragment_maps>', normal.split(NORMAL_SAMPLE).join('siteSample( normalMap, vNormalMapUv )'));
}
