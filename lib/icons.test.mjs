// npm test   (the icon font holds only the icons in use: scripts/icons.py)
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
const all = new Set(read('../node_modules/@phosphor-icons/web/src/regular/style.css').match(/(?<=\.ph\.)ph-[a-z0-9-]+/g))
const have = new Set(read('../app/icons/phosphor.css').match(/(?<=\.ph\.)ph-[a-z0-9-]+/g))

test('every icon used is in app/icons (run npm run icons if not)', () => {
  const files = ['../app/', '../lib/'].flatMap((d) => readdirSync(new URL(d, import.meta.url), { recursive: true })
    .filter((f) => /\.(js|css)$/.test(f) && !f.startsWith('icons')).map((f) => d + f.replaceAll('\\', '/')))
  const missing = [...new Set(files.flatMap((f) => read(f).match(/\bph-[a-z0-9-]+/g) || []))].filter((n) => all.has(n) && !have.has(n))
  assert.deepEqual(missing, [])
})
