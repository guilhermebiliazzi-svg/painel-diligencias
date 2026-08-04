import type { MetadataRoute } from 'next';

// Manifest do PWA — usado quando o site é "Adicionado à tela de início"
// no celular (Android/Chrome). O ícone e o nome vêm daqui.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Painel RE/MAX Ville',
    short_name: 'RE/MAX Ville',
    description: 'Painel administrativo — diligências, cobranças, repasses e notas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#003DA5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
