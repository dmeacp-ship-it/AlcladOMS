// Tax invoice files live in a Google Drive folder (GOOGLE_DRIVE_FOLDER_ID).
// tax_invoice_path holds "drive:<file id>"; older uploads are plain paths in the Supabase "tax-invoices" bucket.
// Sign-in: GOOGLE_SERVICE_ACCOUNT_JSON (Workspace Shared Drive) or GOOGLE_CLIENT_ID/SECRET + GOOGLE_REFRESH_TOKEN (Gmail).
import { createSign } from 'node:crypto'
import { db } from './server'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const ALL = 'supportsAllDrives=true'
let cached = { token: '', exp: 0 }

async function token() {
  if (Date.now() < cached.exp) return cached.token
  const env = process.env
  let body
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const now = Math.floor(Date.now() / 1000)
    const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const jwt = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`
    const sig = createSign('RSA-SHA256').update(jwt).sign(sa.private_key, 'base64url')
    body = { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${jwt}.${sig}` }
  } else {
    body = { grant_type: 'refresh_token', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN }
  }
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error}`)
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }
  return j.access_token
}

const auth = async () => ({ Authorization: `Bearer ${await token()}` })

// Uploads into the folder and returns the value to store in tax_invoice_path.
export async function saveInvoice(name, file) {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] })], { type: 'application/json' }))
  form.append('file', file)
  const r = await fetch(`${UPLOAD}?uploadType=multipart&${ALL}&fields=id`, { method: 'POST', headers: await auth(), body: form })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message || 'Drive upload failed')
  return `drive:${j.id}`
}

// Streams the file back through the app, so only signed-in users who can see the order can open it.
export async function openInvoice(path) {
  if (!path.startsWith('drive:')) {
    const { data, error } = await db().storage.from('tax-invoices').createSignedUrl(path, 60)
    if (error) throw error
    return Response.redirect(data.signedUrl, 302)
  }
  const r = await fetch(`${API}/${path.slice(6)}?alt=media&${ALL}`, { headers: await auth() })
  if (!r.ok) throw new Error(`Drive download failed (${r.status})`)
  return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'application/pdf', 'content-disposition': 'inline' } })
}

// Best effort: a file already gone from Drive or storage is not an error.
export async function removeInvoices(paths) {
  const list = paths.filter(Boolean)
  const old = list.filter((p) => !p.startsWith('drive:'))
  if (old.length) await db().storage.from('tax-invoices').remove(old)
  await Promise.all(list.filter((p) => p.startsWith('drive:')).map(async (p) =>
    fetch(`${API}/${p.slice(6)}?${ALL}`, { method: 'DELETE', headers: await auth() }).catch(() => {})))
}
