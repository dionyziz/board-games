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
    // debounce showing (quick loads never flash) and add a grace period before
    // hiding, so brief gaps between staggered load batches don't flicker it off
    timer.current = setTimeout(() => setShow(active), active ? 200 : 400);
    return () => clearTimeout(timer.current);
  }, [active]);

  // Mounted only while loading, with a static opacity — visibility never depends on
  // a CSS transition completing (which can stall on low-end/software renderers).
  return show ? <div className="loading-spinner" role="status" aria-live="polite" aria-label="Loading" /> : null;
}
