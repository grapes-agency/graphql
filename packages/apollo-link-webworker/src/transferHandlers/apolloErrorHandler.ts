import { ApolloError } from '@apollo/client'
import type { TransferHandler } from 'comlink'

import type { TransferableGenericError } from './genericErrorHandler'
import { genericErrorHandler } from './genericErrorHandler'
import type { TransferableGraphQLError } from './graphQLErrorHandler'
import { graphQLErrorHandler } from './graphQLErrorHandler'

type TransferableApolloError = [
  string,
  Array<TransferableGraphQLError>,
  Array<TransferableGenericError>,
  TransferableGenericError | null
]

export const apolloErrorHandler: TransferHandler<ApolloError, TransferableApolloError> = {
  canHandle: (obj): obj is ApolloError => obj instanceof ApolloError,
  serialize: (error: ApolloError) => [
    [
      error.message,
      error.graphQLErrors.map(graphQLError => graphQLErrorHandler.serialize(graphQLError)[0]),
      error.clientErrors.map(clientError => genericErrorHandler.serialize(clientError)[0]),
      error.networkError ? genericErrorHandler.serialize(error.networkError)[0] : null,
    ],
    [],
  ],
  deserialize: args =>
    new ApolloError({
      errorMessage: args[0],
      graphQLErrors: args[1].map(arg => graphQLErrorHandler.deserialize(arg)),
      clientErrors: args[2].map(arg => genericErrorHandler.deserialize(arg)),
      networkError: args[3] ? genericErrorHandler.deserialize(args[3]) : null,
    }),
}
