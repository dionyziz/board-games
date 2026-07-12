import * as THREE from 'three';

// Inject a box-projection sampler into a MeshPhysicalMaterial so a single
// material can paint six different face textures onto a RoundedBox (which has no
// clean 6-group UVs). Picks the face by dominant object-space normal, projects
// object position to UV, and adds a low-frequency roughness jitter. Ported from
// the vanilla practice render.
export type FaceTextures = {
  front: THREE.Texture; back: THREE.Texture; spine: THREE.Texture;
  top: THREE.Texture; bottom: THREE.Texture;
};

export function attachBoxShader(mat: THREE.MeshPhysicalMaterial, tex: FaceTextures, half: THREE.Vector3) {
  const uniforms = {
    tFront: { value: tex.front }, tBack: { value: tex.back }, tSpine: { value: tex.spine },
    tTop: { value: tex.top }, tBottom: { value: tex.bottom }, uHalf: { value: half },
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
        uniform vec3 uHalf;
        varying vec3 vObjPos; varying vec3 vObjNormal;
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
            return n.z >= 0.0 ? texture2D(tFront, uv) : texture2D(tBack, vec2(1.0-uv.x, uv.y));
          } else if (an.x >= an.y){
            uv = vec2(p.z/uHalf.z, p.y/uHalf.y)*0.5+0.5;
            return n.x >= 0.0 ? texture2D(tSpine, vec2(1.0-uv.x, uv.y)) : texture2D(tSpine, uv);
          } else {
            uv = vec2(p.x/uHalf.x, p.z/uHalf.z)*0.5+0.5;
            return n.y >= 0.0 ? texture2D(tTop, vec2(uv.x, 1.0-uv.y)) : texture2D(tBottom, uv);
          }
        }`)
      .replace('#include <map_fragment>', `
        vec4 faceCol = boxAlbedo();
        diffuseColor.rgb *= faceCol.rgb;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (vnoise(vObjPos*22.0)-0.5)*0.16, 0.05, 1.0);`);
  };
  mat.needsUpdate = true;
}
