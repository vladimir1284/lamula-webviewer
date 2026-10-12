#!/usr/bin/env node
// Auditoría de strings crudos en los .vue (puerta F5).
//
// Heurística, no parser: busca (a) texto suelto dentro del <template> con
// acentos o palabras funcionales del español, y (b) atributos de UI estáticos
// (aria-label, title, placeholder, alt) cuyo valor no sea una expresión.
// Falsos positivos posibles; por eso se puede silenciar una línea con el
// comentario `i18n-ignore` en la misma línea.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['components', 'pages']
const UI_ATTRS = ['aria-label', 'title', 'placeholder', 'alt']
// Palabras funcionales que no aparecen en inglés ni en un identificador.
const ES_WORDS = /\b(el|la|los|las|un|una|de|del|con|sin|para|por|que|más|menos|este|esta|estos|estas|hay|sin|desde|hasta|cada|todo|toda|sobre|entre|como|cuando|donde|aunque|pero|ningún|ninguna)\b/i
const ACCENTS = /[áéíóúñÁÉÍÓÚÑ¿¡]/

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

// Los comentarios HTML del template son prosa en español a propósito: se
// blanquean conservando los saltos de línea para no desplazar los números.
function blankHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
}

function templateRange(src) {
  const start = src.indexOf('<template>')
  if (start === -1) return null
  const end = src.lastIndexOf('</template>')
  return end === -1 ? null : [start, end]
}

const findings = []

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = blankHtmlComments(readFileSync(file, 'utf8'))
    const range = templateRange(src)
    if (!range) continue
    const lines = src.split('\n')
    let offset = 0

    for (const [i, line] of lines.entries()) {
      const lineStart = offset
      offset += line.length + 1
      if (lineStart < range[0] || lineStart > range[1]) continue
      if (/i18n-ignore/.test(line)) continue
      // comentarios del template
      if (/^\s*(<!--|\/\/)/.test(line)) continue

      for (const attr of UI_ATTRS) {
        const m = line.match(new RegExp(`(?<![:\\w-])${attr}="([^"{]+)"`))
        if (m && (ACCENTS.test(m[1]) || ES_WORDS.test(m[1]) || /^[A-ZÁÉÍÓÚÑ]/.test(m[1]))) {
          findings.push(`${file}:${i + 1}: atributo ${attr}="${m[1]}" sin traducir`)
        }
      }

      // texto suelto: lo que queda fuera de etiquetas y de interpolaciones
      const text = line
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .trim()
      if (text && (ACCENTS.test(text) || ES_WORDS.test(text))) {
        findings.push(`${file}:${i + 1}: texto suelto «${text}»`)
      }
    }
  }
}

for (const f of findings) console.error(`check-i18n-raw: ${f}`)
if (findings.length > 0) {
  console.error(`check-i18n-raw: ${findings.length} strings crudos`)
  process.exit(1)
}
console.log('check-i18n-raw: sin strings crudos en components/ ni pages/')
