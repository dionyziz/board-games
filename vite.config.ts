import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served under /board-games/ on GitHub Pages. Uses HashRouter so client routing
// needs no server rewrites. public/ (textures, covers, practice) is copied as-is;
// covers/ + practice/ are stripped from the build output (see build script).
export default defineConfig({
  base: '/board-games/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
