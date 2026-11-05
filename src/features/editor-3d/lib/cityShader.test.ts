import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import { cityFragment, cityVertex } from './cityShader';

describe('city facade shader', () => {
  it('computes facade UVs from world coordinates, per instance', () => {
    const vertex = cityVertex(ShaderLib.physical.vertexShader);
    expect(vertex).toContain('uniform vec2 cityModule');
    expect(vertex).toContain('cityWorld = instanceMatrix * cityWorld');
    expect(vertex).toContain('vCityUv =');
    expect(vertex.indexOf('#include <project_vertex>')).toBeLessThan(vertex.indexOf('vCityRoof = step'));
  });

  it('paints windows on facades, a flat color on roofs and lights only facades', () => {
    const fragment = cityFragment(ShaderLib.physical.fragmentShader);
    expect(fragment).toContain('mix( texture2D( map, vCityUv ).rgb, cityRoof, vCityRoof )');
    expect(fragment).toContain('texture2D( emissiveMap, vCityUv ).rgb * ( 1.0 - vCityRoof )');
    expect(fragment).not.toContain('#include <map_fragment>');
    expect(fragment).not.toContain('#include <emissivemap_fragment>');
  });

  it('leaves unrelated shaders untouched', () => {
    const plain = 'void main() {}';
    expect(cityVertex(plain)).toBe(plain);
    expect(cityFragment(plain)).toBe(plain);
  });
});
