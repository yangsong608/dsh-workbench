/**
 * 浏览器半侧构建：复用 dsh-portal 的「模块工厂」预置（基线九项从宿主取，不打包副本）。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

const BASELINE_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig({
  name: 'dsh-workbench/client',
  cwd: packageRoot,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: false,
  deps: { neverBundle: BASELINE_MODULES },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-workbench", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
