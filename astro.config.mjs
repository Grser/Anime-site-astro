// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
  
// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  site: 'http://localhost:4321',
  output: 'server', // ✅ Esto ahora sí se aplica
  vite: {
    plugins: [tailwindcss()]
  }
});
