import * as THREE from 'three';

// Cookie-tin lid: cut a couple of horizontal groove rings around the tin's side,
// near the front (the lid end), so it reads as a lift-off metal lid. `av` is the
// position along the cylinder axis, 0 = back/base .. 1 = front/lid. A dark groove
// + a bright rim just above it fakes the recessed step without extra geometry.
export function attachTinSeam(mat: THREE.MeshPhysicalMaterial, halfH: number) {
  // distinct program key: this material's onBeforeCompile differs from the plain
  // cylinder caps, which share the 'cyl' key — without this they'd collide.
  mat.customProgramCacheKey = () => 'cyl-tinseam';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHalfH = { value: halfH };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAxis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxis = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAxis; uniform float uHalfH;\nfloat gGroove = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float av = vAxis / uHalfH * 0.5 + 0.5;                 // 0 base .. 1 lid
        // main lid parting seam + a shallow companion ridge (the lid's rolled edge)
        float seam = smoothstep(0.014, 0.0, abs(av - 0.60));
        float ridge = smoothstep(0.012, 0.0, abs(av - 0.68));
        gGroove = seam;
        diffuseColor.rgb *= 1.0 - 0.5 * seam;                  // recessed shadow line
        diffuseColor.rgb += 0.12 * ridge * diffuseColor.rgb;   // catch-light on the rim
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.28 * gGroove, 0.05, 1.0);`);
  };
  mat.needsUpdate = true;
}
