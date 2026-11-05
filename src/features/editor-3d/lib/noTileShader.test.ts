import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import { noTileFragment } from './noTileShader';

describe('noTileFragment', () => {
  const source = ShaderLib.physical.fragmentShader;

  it('samples color, roughness and normal maps through the shared virtual pattern', () => {
    const patched = noTileFragment(source);
    expect(patched).toContain('void siteSetup( vec2 uv )');
    expect(patched).toContain('siteSetup( vMapUv )');
    expect(patched).toContain('siteSample( map, vMapUv )');
    expect(patched).toContain('uniform vec3 siteTint');
    expect(patched).toContain('mix( siteTexel.rgb, siteRecolored, siteTintMix )');
    expect(patched).toContain('siteSample( roughnessMap, vRoughnessMapUv )');
    expect(patched).toContain('siteSample( normalMap, vNormalMapUv )');
    expect(patched).not.toContain('#include <map_fragment>');
    expect(patched).not.toContain('texture2D( normalMap, vNormalMapUv )');
  });

  it('declares the helpers after the common chunk, before main()', () => {
    const patched = noTileFragment(source);
    expect(patched.indexOf('#include <common>')).toBeLessThan(patched.indexOf('float siteHash'));
    expect(patched.indexOf('float siteHash')).toBeLessThan(patched.indexOf('void main()'));
  });

  it('leaves shaders without a color map untouched', () => {
    const plain = 'void main() { gl_FragColor = vec4(1.0); }';
    expect(noTileFragment(plain)).toBe(plain);
  });
});
