import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')
const scratchDir = path.join(rootDir, '.temp_assets')

mkdirSync(publicDir, { recursive: true })
mkdirSync(scratchDir, { recursive: true })

console.log('Generating app icon variants and favicons from logo.svg...')

// 1. Copy raw logo.svg to public/logo.svg
const originalSvgPath = path.join(rootDir, 'logo.svg')
copyFileSync(originalSvgPath, path.join(publicDir, 'logo.svg'))

// 2. Create square & clean version for favicon.svg
const svgRaw = readFileSync(originalSvgPath, 'utf8')

// Clean viewBox for exact 1:1 aspect ratio square: "0 -2.345 171.79759 171.79759"
const squareSvg = svgRaw
  .replace(/width="171\.79759mm"/, 'width="512"')
  .replace(/height="167\.1075mm"/, 'height="512"')
  .replace(/viewBox="0 0 171\.79759 167\.1075"/, 'viewBox="0 -2.345 171.79759 171.79759"')

writeFileSync(path.join(publicDir, 'favicon.svg'), squareSvg)

// 3. Generate PNG variants using ImageMagick 'convert'
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
]

for (const { name, size } of sizes) {
  const dest = path.join(publicDir, name)
  console.log(`Generating ${name} (${size}x${size})...`)
  execSync(`convert -background none "${path.join(publicDir, 'favicon.svg')}" -resize ${size}x${size} "${dest}"`)
}

// 4. Generate multi-resolution ICO file (favicon.ico)
console.log('Generating favicon.ico...')
execSync(`convert "${path.join(publicDir, 'favicon-16x16.png')}" "${path.join(publicDir, 'favicon-32x32.png')}" "${path.join(publicDir, 'favicon-48x48.png')}" "${path.join(publicDir, 'favicon.ico')}"`)

// 5. Generate apple-touch-icon.png (180x180 on dark slate background)
console.log('Generating apple-touch-icon.png (180x180 with slate background)...')
const appleIconSvg = `
<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
  <rect width="180" height="180" rx="36" fill="#0f172a"/>
  <g transform="translate(18, 18) scale(0.84)">
    ${squareSvg.slice(squareSvg.indexOf('<g'), squareSvg.indexOf('</svg>'))}
  </g>
</svg>
`
const tempAppleSvg = path.join(scratchDir, 'apple-touch-icon.svg')
writeFileSync(tempAppleSvg, appleIconSvg)
execSync(`convert -background none "${tempAppleSvg}" "${path.join(publicDir, 'apple-touch-icon.png')}"`)

// 6. Generate Social OpenGraph Preview Card (og-image.png - 1200x630)
console.log('Generating og-image.png (1200x630)...')
const ogSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#51c5ab" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#51c5ab" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  
  <!-- Top Accent Bar -->
  <rect x="0" y="0" width="1200" height="6" fill="#51c5ab"/>
  
  <!-- Centered Logo Mark (400x400) -->
  <g transform="translate(400, 115) scale(2.32)">
    ${squareSvg.slice(squareSvg.indexOf('<g'), squareSvg.indexOf('</svg>'))}
  </g>
</svg>
`
const tempOgSvg = path.join(scratchDir, 'og-image.svg')
writeFileSync(tempOgSvg, ogSvg)
execSync(`convert -background none "${tempOgSvg}" "${path.join(publicDir, 'og-image.png')}"`)

// 7. Write site.webmanifest
console.log('Writing site.webmanifest...')
const webManifest = {
  name: 'LAMULA WebViewer',
  short_name: 'LAMULA',
  description: 'Visualizador Web de productos de radar NEXRAD Level III',
  icons: [
    {
      src: '/android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
    },
  ],
  theme_color: '#0f172a',
  background_color: '#0f172a',
  display: 'standalone',
  orientation: 'any',
  start_url: '/',
}

writeFileSync(path.join(publicDir, 'site.webmanifest'), JSON.stringify(webManifest, null, 2))

// Cleanup temp folder
rmSync(scratchDir, { recursive: true, force: true })

console.log('All favicons and icon variants successfully generated!')
