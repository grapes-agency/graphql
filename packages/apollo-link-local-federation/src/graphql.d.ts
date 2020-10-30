declare module '*.graphql' {
  import type { DocumentNode } from '@apollo/client/core'

  const Schema: DocumentNode

  export = Schema
}
