import { execSync } from 'child_process'
import path from 'path'

import clear from 'rollup-plugin-clear'
import gql from 'rollup-plugin-graphql-tag'
import typescript from 'rollup-plugin-typescript2'

export const external = id => !(id.startsWith('.') || id.startsWith('/'))

const yalcPublisher = () =>
  process.argv.includes('--yalc')
    ? {
        writeBundle: () => {
          execSync('yalc publish --push', {
            stdio: 'inherit',
            cwd: 'dist',
          })
        },
      }
    : {}

export default [
  {
    input: './src/index.ts',
    output: {
      file: './dist/index.cjs.js',
      format: 'cjs',
    },
    external,
    plugins: [clear({ targets: ['./dist'] }), gql(), typescript()],
  },
  {
    input: './src/index.ts',
    output: {
      dir: './dist',
      format: 'esm',
      preserveModules: true,
      sourcemap: true,
    },
    treeshake: false,
    external,
    plugins: [
      gql(),
      typescript({
        tsconfigOverride: {
          include: [path.join(process.cwd(), 'src')],
          compilerOptions: {
            declaration: true,
            sourceMap: true,
          },
        },
      }),
      yalcPublisher(),
    ],
  },
]
