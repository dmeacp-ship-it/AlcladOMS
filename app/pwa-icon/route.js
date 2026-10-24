import { ImageResponse } from 'next/og'

// Home-screen icons for the installed app (app/manifest.js): /pwa-icon?s=192|512. Full-bleed red with the
// factory mark inside the middle 60%, so Android's round/squircle masks never cut it.
export function GET(req) {
  const s = new URL(req.url).searchParams.get('s') === '512' ? 512 : 192
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#D70015' }}>
        <svg width={s * 0.6} height={s * 0.6} viewBox="0 0 64 64"><path d="M12 50V30l11 7v-7l11 7v-7l11 7V16h7v34z" fill="#fff" /></svg>
      </div>
    ),
    { width: s, height: s, headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  )
}
