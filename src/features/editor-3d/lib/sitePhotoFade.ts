/**
 * Переход земли в фотографию: вдали поверхность участка плавно заменяется тем пикселем
 * панорамы, который виден в этом же направлении. У края участка земля совпадает с фоном
 * пиксель в пиксель, поэтому шва и «обрезанных» деревьев у горизонта нет, а вблизи —
 * настоящая 3D-поверхность. Смешивание идёт после тонмаппинга, как и вывод фона.
 * Патчи для onBeforeCompile стандартного материала (в том числе InstancedMesh).
 * @module editor-3d/lib/sitePhotoFade
 */

import type { IUniform, Texture } from 'three';

/** Униформы перехода в фото. */
export interface PhotoFadeUniforms {
  [name: string]: IUniform;
  sitePhoto: IUniform<Texture | null>;
  /** Яркость снимка (как у фона) */
  sitePhotoIntensity: IUniform<number>;
  /** Поворот панорамы вокруг вертикали, рад */
  sitePhotoRotation: IUniform<number>;
  /** Расстояние от центра участка: начало и конец перехода, м */
  sitePhotoFade: IUniform<[number, number]>;
}

const VERTEX_PARS = 'varying vec3 vSiteWorld;\n';

const VERTEX = /* glsl */ `
#include <project_vertex>
vec4 siteWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  siteWorld = instanceMatrix * siteWorld;
#endif
vSiteWorld = ( modelMatrix * siteWorld ).xyz;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vSiteWorld;
uniform sampler2D sitePhoto;
uniform float sitePhotoIntensity;
uniform float sitePhotoRotation;
uniform vec2 sitePhotoFade;
vec3 sitePhotoColor( vec3 direction ) {
  float c = cos( sitePhotoRotation );
  float s = sin( sitePhotoRotation );
  vec3 d = vec3( c * direction.x - s * direction.z, direction.y, s * direction.x + c * direction.z );
  vec2 uv = vec2( atan( d.z, d.x ) * RECIPROCAL_PI2 + 0.5, asin( clamp( d.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5 );
  // Производные без скачка на шве развёртки (u: 1 → 0), иначе на шве выбирается мелкий мип.
  vec2 seamless = vec2( fract( uv.x + 0.5 ), uv.y );
  vec2 dx = dFdx( uv );
  vec2 dy = dFdy( uv );
  vec2 dx2 = dFdx( seamless );
  vec2 dy2 = dFdy( seamless );
  if ( abs( dx2.x ) < abs( dx.x ) ) dx.x = dx2.x;
  if ( abs( dy2.x ) < abs( dy.x ) ) dy.x = dy2.x;
  return textureGrad( sitePhoto, uv, dx, dy ).rgb * sitePhotoIntensity;
}
`;

const FRAGMENT = /* glsl */ `
#include <fog_fragment>
float sitePhotoMix = smoothstep( sitePhotoFade.x, sitePhotoFade.y, length( vSiteWorld.xz ) );
if ( sitePhotoMix > 0.0 ) {
  vec3 sitePhotoPixel = linearToOutputTexel( vec4( sitePhotoColor( normalize( vSiteWorld - cameraPosition ) ), 1.0 ) ).rgb;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, sitePhotoPixel, sitePhotoMix );
}
`;

/** Добавить переход в фото к вершинному шейдеру (мировые координаты фрагмента). */
export function photoFadeVertex(source: string): string {
  if (!source.includes('#include <project_vertex>')) return source;
  return source.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`).replace('#include <project_vertex>', VERTEX);
}

/** Добавить переход в фото к фрагментному шейдеру (после тумана и тонмаппинга). */
export function photoFadeFragment(source: string): string {
  if (!source.includes('#include <fog_fragment>')) return source;
  return source.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`).replace('#include <fog_fragment>', FRAGMENT);
}

/**
 * Униформы перехода.
 * @param photo - снимок фона (equirect, sRGB)
 * @param fade - начало и конец перехода, м от центра
 */
export function photoFadeUniforms(photo: Texture, fade: [number, number]): PhotoFadeUniforms {
  return {
    sitePhoto: { value: photo },
    sitePhotoIntensity: { value: 1 },
    sitePhotoRotation: { value: 0 },
    sitePhotoFade: { value: fade },
  };
}
