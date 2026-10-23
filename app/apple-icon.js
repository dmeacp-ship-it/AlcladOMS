import { ImageResponse } from 'next/og'

// iPhone / iPad home-screen icon: the favicon (app/icon.svg) drawn at 180px. iOS rounds the corners itself.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#D70015' }}>
        <svg width="140" height="140" viewBox="0 0 64 64"><path d="M12 50V30l11 7v-7l11 7v-7l11 7V16h7v34z" fill="#fff" /></svg>
      </div>
    ),
    size,
  )
}
