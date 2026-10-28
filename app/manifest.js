// "Add to Home Screen" / "Install app": opens full screen on Orders, like a normal app.
export default function manifest() {
  return {
    name: 'TAS OMS',
    short_name: 'TAS OMS',
    description: 'TAS International order management',
    start_url: '/orders',
    display: 'standalone',
    background_color: '#F2F2F7',
    theme_color: '#D70015',
    icons: [
      { src: '/pwa-icon?s=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?s=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?s=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
