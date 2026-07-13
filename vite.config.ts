import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the root of the custom domain jasongames.xyz (public/CNAME) on GitHub
// Pages. Uses HashRouter so client routing needs no server rewrites. public/
// (textures, covers, practice) is copied as-is; covers/ + practice/ are stripped
// from the build output (see build script).
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
