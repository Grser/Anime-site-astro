// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'http://localhost:4321',
  output: 'server', // ✅ Esto ahora sí se aplica
  vite: {
    plugins: [tailwindcss()]
  }
});
