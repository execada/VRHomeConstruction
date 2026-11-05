/**
 * Фасады зданий города в мировых координатах: окна одного размера на любом здании
 * (InstancedMesh из одного куба), крыши — ровного цвета, у каждого здания свой сдвиг
 * рисунка окон, поэтому вечерние огни не повторяются. Патч для onBeforeCompile.
 * @module editor-3d/lib/cityShader
 */

const VERTEX_PARS = /* glsl */ `
uniform vec2 cityModule;
varying vec2 vCityUv;
varying float vCityRoof;
`;

const VERTEX = /* glsl */ `
#include <project_vertex>
vec4 cityWorld = vec4( transformed, 1.0 );
vec3 cityNormal = objectNormal;
float cityShift = 0.0;
#ifdef USE_INSTANCING
  cityWorld = instanceMatrix * cityWorld;
  cityNormal = mat3( instanceMatrix ) * cityNormal;
  cityShift = floor( fract( sin( dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 8.0 ) / 8.0;
#endif
cityWorld = modelMatrix * cityWorld;
cityNormal = normalize( mat3( modelMatrix ) * cityNormal );
vCityRoof = step( 0.5, cityNormal.y );
vCityUv = ( abs( cityNormal.x ) > abs( cityNormal.z ) ? cityWorld.zy : cityWorld.xy ) / cityModule + vec2( cityShift, 0.0 );
`;

const FRAGMENT_PARS = /* glsl */ `
uniform vec3 cityRoof;
varying vec2 vCityUv;
varying float vCityRoof;
`;

const MAP = /* glsl */ `
#ifdef USE_MAP
  diffuseColor.rgb *= mix( texture2D( map, vCityUv ).rgb, cityRoof, vCityRoof );
#endif
`;

const EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
  totalEmissiveRadiance *= texture2D( emissiveMap, vCityUv ).rgb * ( 1.0 - vCityRoof );
#endif
`;

/** Вершинный шейдер: UV фасада по мировым координатам и признак крыши. */
export function cityVertex(source: string): string {
  if (!source.includes('#include <project_vertex>') || !source.includes('#include <beginnormal_vertex>')) return source;
  return source.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`).replace('#include <project_vertex>', VERTEX);
}

/** Фрагментный шейдер: окна по мировым UV, крыши ровного цвета, огни только на фасадах. */
export function cityFragment(source: string): string {
  if (!source.includes('#include <map_fragment>') || !source.includes('#include <emissivemap_fragment>')) return source;
  return source
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', MAP)
    .replace('#include <emissivemap_fragment>', EMISSIVE);
}
