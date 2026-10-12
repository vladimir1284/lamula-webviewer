#!/usr/bin/env node
// Paridad de claves entre los catálogos de i18n (puerta F5).
//
// `fallbackLocale: 'es'` evita que una clave sin traducir imprima la clave
// cruda en producción — pero esconde el agujero. Este script es el que debe
// fallar: CI rompe si `en` y `es` no tienen exactamente el mismo conjunto de
// claves hoja, si una hoja no es string, o si a un idioma le falta un fichero
// de namespace entero.
//
// Lo que este script NO cubre todavía: strings crudos en los .vue. Esa
// auditoría se añade al cerrar F5, cuando los 24 componentes estén migrados
// (hoy fallaría por diseño).
import { readFileSync, readdirSync } from 'node:fs'

const DIR = new URL('../i18n/locales/', import.meta.url)
const DEFAULT_LOCALE = 'es'

function leaves(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leaves(v, key))
    else out.push([key, v])
  }
  return out
}

function readLocale(code) {
  const dir = new URL(`${code}/`, DIR)
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  const keys = new Map()
  for (const f of files) {
    const ns = f.replace(/\.json$/, '')
    const parsed = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
    // Cada fichero envuelve su propio namespace: prefs.json → { "prefs": {…} }.
    // Sin esa envoltura el módulo funde las claves en la raíz y dos namespaces
    // podrían pisarse en silencio.
    const roots = Object.keys(parsed)
    if (roots.length !== 1 || roots[0] !== ns) {
      console.error(`check-i18n: ${code}/${f} debe contener exactamente la clave raíz "${ns}" (tiene: ${roots.join(', ') || 'ninguna'})`)
      process.exitCode = 1
      continue
    }
    for (const [k, v] of leaves(parsed)) keys.set(k, v)
  }
  return { files: new Set(files), keys }
}

const codes = readdirSync(DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()

if (codes.length < 2) {
  console.error(`check-i18n: se esperaban al menos 2 idiomas en i18n/locales/, hay ${codes.length}`)
  process.exit(1)
}

const catalogs = new Map(codes.map(c => [c, readLocale(c)]))
const refCode = catalogs.has(DEFAULT_LOCALE) ? DEFAULT_LOCALE : codes[0]
const ref = catalogs.get(refCode)
let failed = process.exitCode === 1

for (const [code, cat] of catalogs) {
  for (const [key, value] of cat.keys) {
    if (typeof value !== 'string') {
      console.error(`check-i18n: ${code} → "${key}" no es string (${typeof value})`)
      failed = true
    }
  }
  if (code === refCode) continue

  for (const f of ref.files) {
    if (!cat.files.has(f)) {
      console.error(`check-i18n: falta el fichero ${code}/${f} (está en ${refCode}/)`)
      failed = true
    }
  }
  for (const f of cat.files) {
    if (!ref.files.has(f)) {
      console.error(`check-i18n: sobra el fichero ${code}/${f} (no está en ${refCode}/)`)
      failed = true
    }
  }
  for (const k of ref.keys.keys()) {
    if (!cat.keys.has(k)) {
      console.error(`check-i18n: falta "${k}" en ${code} (está en ${refCode})`)
      failed = true
    }
  }
  for (const k of cat.keys.keys()) {
    if (!ref.keys.has(k)) {
      console.error(`check-i18n: sobra "${k}" en ${code} (no está en ${refCode})`)
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log(`check-i18n: ${catalogs.size} idiomas, ${ref.files.size} namespaces, ${ref.keys.size} claves, paridad correcta`)
