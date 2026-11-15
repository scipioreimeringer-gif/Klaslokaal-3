import type {MetadataRoute} from 'next';

// Installable web app (PWA). Login stays the normal Supabase/Google flow in the browser context.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TeachyRooms',
    short_name: 'TeachyRooms',
    description: 'Online lessen met eigen klaslokaal per leerling, huiswerk, woordenschat en oefeningen.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#EAF6F5',
    theme_color: '#0C4853',
    lang: 'nl',
    categories: ['education'],
    icons: [
      {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
    shortcuts: [
      {name: 'Oefenen', url: '/oefenen'},
      {name: 'Mijn lessen', url: '/mijn-profiel'},
      {name: 'Live klaslokaal', url: '/klaslokaal/live'},
    ],
  };
}
