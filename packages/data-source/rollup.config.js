import baseConfig from '../../rollup.config'
import gql from 'rollup-plugin-graphql-tag'
import typescript from 'rollup-plugin-typescript2'

export default [
  ...baseConfig,
  {
    input: './src/server/index.ts',
    output: [{
      file: './dist/server/index.cjs.js',
      format: 'cjs',
    }, {
      dir: './dist',
      format: 'esm',
      preserveModules: true,
      sourcemap: true,
    }],
    external: baseConfig[0].external,
    plugins: [gql(), typescript()],
  },
]