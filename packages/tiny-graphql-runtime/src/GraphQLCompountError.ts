import { GraphQLError } from 'graphql'

export class GraphQLCompountError extends GraphQLError {
  constructor(public errors: Array<GraphQLError>) {
    super(
      errors[0].message,
      errors[0].nodes,
      errors[0].source,
      errors[0].positions,
      errors[0].path,
      errors[0].originalError,
      errors[0].extensions
    )
  }
}
