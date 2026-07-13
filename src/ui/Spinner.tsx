import { useEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';

// A small spinner shown while textures/models are still downloading. Both the
// texture pool (THREE.TextureLoader) and the bag model (useGLTF/GLTFLoader) load
// through Three's DefaultLoadingManager, which useProgress tracks — so this covers
// both. Debounced so quick loads (cached / fast link) never flash it on screen.
export default function Spinner() {
  const { active } = useProgress();
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    // Wait 1s before showing so fast systems never flash it for small/quick loads
    // (only genuinely slow loads linger past this); a grace period before hiding
    // keeps brief gaps between staggered load batches from flickering it off.
    timer.current = setTimeout(() => setShow(active), active ? 1000 : 400);
    return () => clearTimeout(timer.current);
  }, [active]);

  // Mounted only while loading, with a static opacity — visibility never depends on
  // a CSS transition completing (which can stall on low-end/software renderers).
  return show ? <div className="loading-spinner" role="status" aria-live="polite" aria-label="Loading" /> : null;
}
