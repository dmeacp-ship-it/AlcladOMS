import { unstable_cache } from 'next/cache'
import { db } from '@/lib/server'

const letterhead = unstable_cache(async () => (await db().from('app_settings').select('letterhead').eq('id', 1).maybeSingle()).data?.letterhead, ['letterhead'], { tags: ['masters'] })

// Letterhead image for the printable documents: the one uploaded under Settings → Company,
// else the built-in public/letterhead.png. Documents link it as /letterhead?v=<upload time>.
export async function GET(req) {
  const m = (await letterhead())?.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return Response.redirect(new URL('/letterhead.png', req.url), 302)
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable' },
  })
}
