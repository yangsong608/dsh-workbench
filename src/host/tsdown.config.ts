/**
 * 宿主半侧构建：ESM / node / lib/index.js（不压缩）。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  name: 'dsh-workbench/host',
  cwd: packageRoot,
  entry: { index: 'src/host/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  dts: false,
  sourcemap: false,
  clean: false,
  outputOptions: { entryFileNames: 'index.js' },
})
