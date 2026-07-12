import * as THREE from 'three';

// Inject a box-projection sampler into a MeshPhysicalMaterial so one material can
// paint six face textures onto a RoundedBox (no clean 6-group UVs). Picks the
// face by dominant object-space normal, projects object position to UV, adds a
// low-frequency roughness jitter, AND embosses printed text/graphics using a
// DEDICATED per-face bump map (rendered from the text SVG, white ink on black) —
// sampled with the same projection so only the text/barcode shine, never the
// artwork. Photographic faces get a flat (black) bump = no emboss.
export type FaceMap = {
  front: THREE.Texture; back: THREE.Texture; spine: THREE.Texture;
  top: THREE.Texture; bottom: THREE.Texture;
};

export function attachBoxShader(mat: THREE.MeshPhysicalMaterial, tex: FaceMap, bump: FaceMap, half: THREE.Vector3) {
  const uniforms = {
    tFront: { value: tex.front }, tBack: { value: tex.back }, tSpine: { value: tex.spine },
    tTop: { value: tex.top }, tBottom: { value: tex.bottom },
    bFront: { value: bump.front }, bBack: { value: bump.back }, bSpine: { value: bump.spine },
    bTop: { value: bump.top }, bBottom: { value: bump.bottom },
    uHalf: { value: half },
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
        uniform sampler2D bFront, bBack, bSpine, bTop, bBottom;
        uniform vec3 uHalf;
        varying vec3 vObjPos; varying vec3 vObjNormal;
        float gEmboss = 0.0;   // printed-ink height at this fragment (from the bump map)
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        vec4 boxAlbedo(){
          vec3 n = normalize(vObjNormal); vec3 an = abs(n); vec3 p = vObjPos; vec2 uv;
          if (an.z >= an.x && an.z >= an.y){
            uv = vec2(p.x/uHalf.x, p.y/uHalf.y)*0.5+0.5;
            if (n.z >= 0.0){ gEmboss = texture2D(bFront, uv).r; return texture2D(tFront, uv); }
            vec2 ub = vec2(1.0-uv.x, uv.y); gEmboss = texture2D(bBack, ub).r; return texture2D(tBack, ub);
          } else if (an.x >= an.y){
            uv = vec2(p.z/uHalf.z, p.y/uHalf.y)*0.5+0.5;
            vec2 us = n.x >= 0.0 ? vec2(1.0-uv.x, uv.y) : uv;
            gEmboss = texture2D(bSpine, us).r; return texture2D(tSpine, us);
          } else {
            uv = vec2(p.x/uHalf.x, p.z/uHalf.z)*0.5+0.5;
            if (n.y >= 0.0){ vec2 ut = vec2(uv.x, 1.0-uv.y); gEmboss = texture2D(bTop, ut).r; return texture2D(tTop, ut); }
            gEmboss = texture2D(bBottom, uv).r; return texture2D(tBottom, uv);
          }
        }`)
      .replace('#include <map_fragment>', `
        vec4 faceCol = boxAlbedo();
        diffuseColor.rgb *= faceCol.rgb;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (vnoise(vObjPos*22.0)-0.5)*0.16, 0.05, 1.0);`)
      // emboss printed ink: perturb the shading normal by the screen-space gradient
      // of the (text-only) bump height, on top of the global paper bump.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gEmboss > 0.003) {
          vec3 fdx = dFdx(vViewPosition); vec3 fdy = dFdy(vViewPosition);
          float dHx = dFdx(gEmboss); float dHy = dFdy(gEmboss);
          vec3 r1 = cross(fdy, normal); vec3 r2 = cross(normal, fdx);
          float det = dot(fdx, r1);
          vec3 grad = sign(det) * (dHx * r1 + dHy * r2);
          normal = normalize(abs(det) * normal - 1.3 * grad);
        }`);
  };
  mat.needsUpdate = true;
}
