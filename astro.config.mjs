// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://anime.clawn.cat',
  output: 'server',
  adapter: node({
    mode: 'standalone', // listo para desplegar como app Node
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
