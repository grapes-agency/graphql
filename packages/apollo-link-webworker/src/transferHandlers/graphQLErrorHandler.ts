import type { TransferHandler } from 'comlink'
import type { ASTNode, Source } from 'graphql'
import { GraphQLError } from 'graphql'

import type { SerializedField } from '../utils'
import { serializeObject, deserializeObject } from '../utils'

type Maybe<T> = null | undefined | T
export type TransferableGraphQLError = [
  string,
  Maybe<ReadonlyArray<ASTNode> | ASTNode>,
  Maybe<Source>,
  Maybe<ReadonlyArray<number>>,
  Maybe<ReadonlyArray<string | number>>,
  SerializedField,
  SerializedField
]

export const graphQLErrorHandler: TransferHandler<GraphQLError, TransferableGraphQLError> = {
  canHandle: (obj): obj is GraphQLError => obj instanceof GraphQLError,
  serialize: (error: GraphQLError) => [
    [
      error.message,
      error.nodes,
      error.source,
      error.positions,
      error.path,
      serializeObject(error.originalError)[0],
      serializeObject(error.extensions)[0],
    ],
    [],
  ],
  deserialize: ([message, nodes, source, positions, path, originalError, extensions]) =>
    new GraphQLError(message, nodes, source, positions, path, deserializeObject(originalError), deserializeObject(extensions)),
}
