import type { Operation } from '@apollo/client/core'
import type { DocumentNode } from 'graphql'

export const createOperation = (query: DocumentNode, variables: Operation['variables'] = {}): Operation => ({
  query,
  operationName: '',
  setContext: c => c,
  getContext: () => ({}),
  extensions: {},
  variables,
})
