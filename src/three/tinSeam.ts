import * as THREE from 'three';

// Cut horizontal groove rings around a cylinder's side (lid/base parting lines):
// a lift-off tin lid, a tube's cap seam, etc. `seams` are positions along the
// axis (0 = base .. 1 = lid). Each is a dark groove + a bright rim just above it,
// faked tonally so no extra geometry is needed. `av` is the axial coordinate.
export function attachSeams(mat: THREE.MeshPhysicalMaterial, halfH: number, seams: number[]) {
  // distinct program key per seam layout (must differ from the plain caps)
  mat.customProgramCacheKey = () => 'cyl-seam:' + seams.join(',');
  const rings = seams.map((at) => `{
    float seam = smoothstep(0.014, 0.0, abs(av - ${at.toFixed(4)}));
    float ridge = smoothstep(0.012, 0.0, abs(av - ${Math.min(at + 0.06, 0.99).toFixed(4)}));
    gGroove = max(gGroove, seam);
    diffuseColor.rgb *= 1.0 - 0.5 * seam;
    diffuseColor.rgb += 0.12 * ridge * diffuseColor.rgb;
  }`).join('\n');
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHalfH = { value: halfH };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAxis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxis = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAxis; uniform float uHalfH;\nfloat gGroove = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float av = vAxis / uHalfH * 0.5 + 0.5; // 0 base .. 1 lid
        ${rings}
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.28 * gGroove, 0.05, 1.0);`);
  };
  mat.needsUpdate = true;
}
