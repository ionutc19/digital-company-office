// Copies the map, tilesets and character sprites used by the Office view
// into the plugin bundle (served by Hermes at /dashboard-plugins/<name>/...).
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const client = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(client, 'public', 'assets')
const dest = join(client, '..', 'hermes-plugin', 'digital-company', 'dashboard', 'dist', 'assets')
// Character sheets: only the textures the roster uses (officeLayout.json).
const layout = JSON.parse(readFileSync(join(client, 'src', 'digital-company', 'officeLayout.json'), 'utf8'))
const characters = [...new Set(Object.values(layout.agents).map((a) => a.texture))].map((t) => `character/${t}.png`)
const files = [
  'map/map.json', 'map/FloorAndGround.png',
  'items/chair.png', 'items/computer.png', 'items/whiteboard.png', 'items/vendingmachine.png',
  'tileset/Modern_Office_Black_Shadow.png', 'tileset/Basement.png', 'tileset/Generic.png',
  ...characters,
]
for (const f of files) {
  const from = join(src, f)
  if (!existsSync(from)) throw new Error(`Missing asset ${from}`)
  mkdirSync(dirname(join(dest, f)), { recursive: true })
  cpSync(from, join(dest, f))
}
console.log(`Copied ${files.length} assets to ${dest}`)
