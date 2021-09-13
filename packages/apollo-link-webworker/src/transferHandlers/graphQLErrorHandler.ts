import type { TransferHandler } from 'comlink'
import type { ASTNode, Source } from 'graphql'
import { GraphQLError } from 'graphql'

type Maybe<T> = null | undefined | T
type TransferableGraphQLError = [
  string,
  Maybe<ReadonlyArray<ASTNode> | ASTNode>,
  Maybe<Source>,
  Maybe<ReadonlyArray<number>>,
  Maybe<ReadonlyArray<string | number>>,
  Maybe<Error>,
  Maybe<{ [key: string]: any }>
]

export const graphQLErrorHandler: TransferHandler<GraphQLError, TransferableGraphQLError> = {
  canHandle: (obj): obj is GraphQLError => obj instanceof GraphQLError,
  serialize: (error: GraphQLError) => [
    [error.message, error.nodes, error.source, error.positions, error.path, error.originalError, error.extensions],
    [],
  ],
  deserialize: constructorArgs => new GraphQLError(...constructorArgs),
}
