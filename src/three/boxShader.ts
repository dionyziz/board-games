import * as THREE from 'three';

// One material paints six face textures onto a RoundedBox via box projection
// (dominant object-space normal → face, project object pos → UV), plus a
// roughness jitter, plus a clean text EMBOSS. The emboss reads a dedicated
// per-face bump map and computes an ANALYTIC normal from the bump's own texel
// gradient in each face's known object-space tangent frame — no screen-space
// derivatives (which caused ringing/aliasing halos around letters). Photographic
// faces get a flat black bump → no emboss.
export type FaceMap = {
  front: THREE.Texture; back: THREE.Texture; spine: THREE.Texture;
  top: THREE.Texture; bottom: THREE.Texture;
};

export function attachBoxShader(mat: THREE.MeshPhysicalMaterial, tex: FaceMap, bump: FaceMap, half: THREE.Vector3) {
  const u = {
    tFront: { value: tex.front }, tBack: { value: tex.back }, tSpine: { value: tex.spine },
    tTop: { value: tex.top }, tBottom: { value: tex.bottom },
    bFront: { value: bump.front }, bBack: { value: bump.back }, bSpine: { value: bump.spine },
    bTop: { value: bump.top }, bBottom: { value: bump.bottom },
    uHalf: { value: half },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;\nvarying mat3 vNMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = transformed;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjNormal = objectNormal;\nvNMat = normalMatrix;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tFront, tBack, tSpine, tTop, tBottom;
        uniform sampler2D bFront, bBack, bSpine, bTop, bBottom;
        uniform vec3 uHalf;
        varying vec3 vObjPos; varying vec3 vObjNormal; varying mat3 vNMat;
        float gEmboss = 0.0;          // gate: text present at this fragment
        vec3  gNormalO = vec3(0.0);   // analytic object-space normal (with emboss)
        float gSeamDark = 1.0;        // lid-seam shadow darkening (edge faces only)
        const float EMB = 2.6;        // emboss strength
        const float E = 0.004;        // texel step for the height gradient (uv)
        const float SEAM_FRAC = 0.7;  // lid seam depth: fraction from the front (cover) toward the back
        const float SEAM_W = 0.02;    // groove half-width (object units)
        const float SEAM_SLOPE = 0.7; // groove-wall normal tilt
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        // sample bump height gradient at s and build the perturbed object normal
        void emboss(sampler2D b, vec2 s, vec3 Tu, vec3 Tv, vec3 No){
          float c  = texture2D(b, s).r;
          float hu = texture2D(b, s + vec2(E,0.0)).r - texture2D(b, s - vec2(E,0.0)).r;
          float hv = texture2D(b, s + vec2(0.0,E)).r - texture2D(b, s - vec2(0.0,E)).r;
          gEmboss = max(c, max(abs(hu), abs(hv)) * 3.0);
          gNormalO = normalize(No - EMB * (hu * Tu + hv * Tv));
        }
        // A recessed lid seam: a shallow V-groove at object depth z = zSeam. Called
        // only on the four EDGE faces, so it forms a rectangular loop around the box
        // (a "square around the back") — the parting line of a lid+base box. Never
        // touches the printed cover. Front wall tilts +z, back wall -z → a crease.
        void seam(vec3 p, vec3 No){
          float zSeam = uHalf.z * (1.0 - 2.0 * SEAM_FRAC);
          float sd = p.z - zSeam;
          float g = clamp(1.0 - abs(sd) / SEAM_W, 0.0, 1.0);
          if (g <= 0.0) return;
          g = g * g * (3.0 - 2.0 * g);
          vec3 base = (gEmboss > 0.0) ? gNormalO : No;
          gNormalO = normalize(base - SEAM_SLOPE * sign(sd) * g * vec3(0.0, 0.0, 1.0));
          gEmboss = max(gEmboss, g);
          gSeamDark = 1.0 - 0.2 * g;
        }
        vec4 boxAlbedo(){
          vec3 n = normalize(vObjNormal); vec3 an = abs(n); vec3 p = vObjPos; vec2 uv;
          if (an.z >= an.x && an.z >= an.y){
            uv = vec2(p.x/uHalf.x, p.y/uHalf.y)*0.5+0.5;
            if (n.z >= 0.0){ emboss(bFront, uv, vec3(1,0,0), vec3(0,1,0), vec3(0,0,1)); return texture2D(tFront, uv); }
            vec2 s = vec2(1.0-uv.x, uv.y); emboss(bBack, s, vec3(-1,0,0), vec3(0,1,0), vec3(0,0,-1)); return texture2D(tBack, s);
          } else if (an.x >= an.y){
            uv = vec2(p.z/uHalf.z, p.y/uHalf.y)*0.5+0.5;
            if (n.x >= 0.0){ vec2 s = vec2(1.0-uv.x, uv.y); emboss(bSpine, s, vec3(0,0,-1), vec3(0,1,0), vec3(1,0,0)); seam(p, vec3(1,0,0)); return texture2D(tSpine, s); }
            emboss(bSpine, uv, vec3(0,0,1), vec3(0,1,0), vec3(-1,0,0)); seam(p, vec3(-1,0,0)); return texture2D(tSpine, uv);
          } else {
            uv = vec2(p.x/uHalf.x, p.z/uHalf.z)*0.5+0.5;
            if (n.y >= 0.0){ vec2 s = vec2(uv.x, 1.0-uv.y); emboss(bTop, s, vec3(1,0,0), vec3(0,0,-1), vec3(0,1,0)); seam(p, vec3(0,1,0)); return texture2D(tTop, s); }
            emboss(bBottom, uv, vec3(1,0,0), vec3(0,0,1), vec3(0,-1,0)); seam(p, vec3(0,-1,0)); return texture2D(tBottom, uv);
          }
        }`)
      .replace('#include <map_fragment>', `
        vec4 faceCol = boxAlbedo();
        diffuseColor.rgb *= faceCol.rgb * gSeamDark;`)
      // cardboard micro-roughness — but NOT under the letters: gate the grain by
      // (1-gEmboss) so the box bump doesn't exist where text is, and lower the
      // roughness there so the raised letters read as smooth printed varnish.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (vnoise(vObjPos*22.0)-0.5)*0.16*(1.0-gEmboss) - gEmboss*0.2, 0.05, 1.0);`)
      // clean analytic emboss: replace the shading normal on text fragments with
      // the bump-perturbed object normal transformed to view space (no dFdx).
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gEmboss > 0.06) { normal = normalize(mix(normal, normalize(vNMat * gNormalO), clamp(gEmboss,0.0,1.0))); }`);
  };
  mat.needsUpdate = true;
}
