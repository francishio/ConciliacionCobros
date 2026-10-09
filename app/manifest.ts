import type { MetadataRoute } from 'next'

// Con el manifiesto + los íconos, Chrome/Edge ofrecen "Instalar aplicación" y la
// app se abre a pantalla completa (sin barra del navegador), como una app nativa.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Conciliación de Cobros',
    short_name: 'Concilia',
    description: 'Conciliación de cobros HIOPOS ↔ pasarelas de cobro',
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#ef7d18',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      // Android recorta los íconos con la forma del sistema: este trae el rayo
      // más chico (zona segura) para que no se corte.
      { src: '/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
