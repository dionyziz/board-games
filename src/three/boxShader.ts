import * as THREE from 'three';

// Inject a box-projection sampler into a MeshPhysicalMaterial so a single
// material can paint six different face textures onto a RoundedBox (no clean
// 6-group UVs). Picks the face by dominant object-space normal, projects object
// position to UV, adds a low-frequency roughness jitter, AND — on procedurally
// generated faces only — embosses the printed text/graphics (derived from the
// texture's own luminance) so the title etc. catch light as the box rotates,
// on top of the global paper bump map. Ported/extended from the practice render.
export type FaceTextures = {
  front: THREE.Texture; back: THREE.Texture; spine: THREE.Texture;
  top: THREE.Texture; bottom: THREE.Texture;
};

// proc = per-face emboss strength [front, back, spine, top, bottom]
// (1 for generated faces so their text shines; 0 for photographic faces).
export function attachBoxShader(mat: THREE.MeshPhysicalMaterial, tex: FaceTextures, half: THREE.Vector3, proc: number[]) {
  const uniforms = {
    tFront: { value: tex.front }, tBack: { value: tex.back }, tSpine: { value: tex.spine },
    tTop: { value: tex.top }, tBottom: { value: tex.bottom }, uHalf: { value: half },
    uProc: { value: proc.slice(0, 5) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = transformed;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjNormal = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tFront, tBack, tSpine, tTop, tBottom;
        uniform vec3 uHalf; uniform float uProc[5];
        varying vec3 vObjPos; varying vec3 vObjNormal;
        float gEmboss = 0.0;               // per-fragment printed-ink height (procedural faces)
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        vec4 boxAlbedo(out float prc){
          vec3 n = normalize(vObjNormal); vec3 an = abs(n); vec3 p = vObjPos; vec2 uv;
          if (an.z >= an.x && an.z >= an.y){
            uv = vec2(p.x/uHalf.x, p.y/uHalf.y)*0.5+0.5;
            if (n.z >= 0.0){ prc = uProc[0]; return texture2D(tFront, uv); }
            prc = uProc[1]; return texture2D(tBack, vec2(1.0-uv.x, uv.y));
          } else if (an.x >= an.y){
            uv = vec2(p.z/uHalf.z, p.y/uHalf.y)*0.5+0.5; prc = uProc[2];
            return n.x >= 0.0 ? texture2D(tSpine, vec2(1.0-uv.x, uv.y)) : texture2D(tSpine, uv);
          } else {
            uv = vec2(p.x/uHalf.x, p.z/uHalf.z)*0.5+0.5;
            if (n.y >= 0.0){ prc = uProc[3]; return texture2D(tTop, vec2(uv.x, 1.0-uv.y)); }
            prc = uProc[4]; return texture2D(tBottom, uv);
          }
        }`)
      .replace('#include <map_fragment>', `
        float _prc; vec4 faceCol = boxAlbedo(_prc);
        diffuseColor.rgb *= faceCol.rgb;
        gEmboss = dot(faceCol.rgb, vec3(0.2126,0.7152,0.0722)) * _prc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (vnoise(vObjPos*22.0)-0.5)*0.16, 0.05, 1.0);`)
      // emboss the printed ink: perturb the shading normal by the screen-space
      // gradient of gEmboss (Blinn bump, no tangents needed). Adds on top of the
      // global bump map already applied by <normal_fragment_maps>.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gEmboss > 0.001) {
          vec3 fdx = dFdx(vViewPosition); vec3 fdy = dFdy(vViewPosition);
          float dHx = dFdx(gEmboss); float dHy = dFdy(gEmboss);
          vec3 r1 = cross(fdy, normal); vec3 r2 = cross(normal, fdx);
          float det = dot(fdx, r1);
          vec3 grad = sign(det) * (dHx * r1 + dHy * r2);
          normal = normalize(abs(det) * normal - 1.1 * grad);
        }`);
  };
  mat.needsUpdate = true;
}
