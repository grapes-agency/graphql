import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import clear from 'rollup-plugin-clear'
import copy from 'rollup-plugin-copy-glob'
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
    plugins: [
      clear({ targets: ['./dist'] }),
      {
        writeBundle: () => {
          const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
          delete packageJson.scripts
          delete packageJson.devDependencies
          delete packageJson.eslintConfig
          delete packageJson.prettier
          delete packageJson.publishConfig.directory

          fs.writeFileSync(
            './dist/package.json',
            JSON.stringify(
              {
                ...packageJson,
                main: 'index.cjs.js',
                module: 'index.js',
              },
              null,
              '  '
            )
          )
        },
      },
      copy([
        { files: '*.md', dest: 'dist' },
        { files: 'package-lock.json', dest: 'dist' },
      ]),
      gql(),
      typescript(),
    ],
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
