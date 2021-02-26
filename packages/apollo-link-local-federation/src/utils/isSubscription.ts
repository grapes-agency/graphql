import { getMainDefinition } from '@apollo/client/utilities'
import type { DocumentNode } from 'graphql'

export const isSubscription = (document: DocumentNode) => {
  const mainDefinition = getMainDefinition(document)
  return mainDefinition.kind === 'OperationDefinition' && mainDefinition.operation === 'subscription'
}
