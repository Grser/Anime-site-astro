# Adaptación de ClawnVID a Astro y Tailwind

![Vista previa](./public/avatar.jpeg)

Este proyecto es una migración de **ClawnVID** a [Astro](https://astro.build/) utilizando **Tailwind CSS** para los estilos. Incluye una estructura mínima para comenzar a desarrollar de forma rápida.

## 🚀 Estructura del proyecto

```
/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── header.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
└── package.json
```

## Requisitos
- [Node.js](https://nodejs.org/) y [pnpm](https://pnpm.io) instalados.
- En `astro.config.mjs` se recomienda definir `output: 'server'` para desplegar en entornos como Vercel o Netlify.

## Instalación
1. Clona el repositorio.
2. Ejecuta `pnpm install` para descargar las dependencias.

## Uso
- `pnpm dev` inicia el servidor de desarrollo en `http://localhost:4321`.
- `pnpm build` genera la versión de producción en la carpeta `dist/`.
- `pnpm preview` permite previsualizar la compilación localmente.
- `pnpm astro -- --help` muestra ayuda adicional de la CLI de Astro.

¡Disfruta construyendo tu proyecto con Astro!
