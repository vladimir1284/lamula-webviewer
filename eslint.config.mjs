import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // los worktrees de agentes son copias del repo bajo .claude/ (excluidas en
  // .git/info/exclude): lintearlas duplica cada error y rompe `pnpm lint`
  { ignores: ['.claude/**'] },
)
