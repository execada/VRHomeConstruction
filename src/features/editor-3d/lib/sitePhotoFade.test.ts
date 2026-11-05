import { describe, expect, it } from 'vitest';
import { ShaderLib, Texture } from 'three';
import { photoFadeFragment, photoFadeUniforms, photoFadeVertex } from './sitePhotoFade';

describe('photo fade shader', () => {
  it('passes the world position, instancing included', () => {
    const vertex = photoFadeVertex(ShaderLib.physical.vertexShader);
    expect(vertex).toContain('varying vec3 vSiteWorld');
    expect(vertex).toContain('siteWorld = instanceMatrix * siteWorld');
    expect(vertex).toContain('#include <project_vertex>');
  });

  it('mixes in the panorama pixel after fog and tone mapping', () => {
    const fragment = photoFadeFragment(ShaderLib.physical.fragmentShader);
    expect(fragment).toContain('uniform sampler2D sitePhoto');
    expect(fragment).toContain('linearToOutputTexel');
    expect(fragment.indexOf('#include <tonemapping_fragment>')).toBeLessThan(fragment.indexOf('sitePhotoMix ='));
    expect(fragment.indexOf('#include <fog_fragment>')).toBeLessThan(fragment.indexOf('sitePhotoMix ='));
  });

  it('chains with other patches of the same include', () => {
    const twice = photoFadeVertex(photoFadeVertex(ShaderLib.physical.vertexShader));
    expect(twice.match(/#include <project_vertex>/g)).toHaveLength(1);
  });

  it('builds uniforms with the photo and the fade range', () => {
    const photo = new Texture();
    const uniforms = photoFadeUniforms(photo, [60, 180]);
    expect(uniforms.sitePhoto.value).toBe(photo);
    expect(uniforms.sitePhotoFade.value).toEqual([60, 180]);
    expect(uniforms.sitePhotoIntensity.value).toBe(1);
  });
});
