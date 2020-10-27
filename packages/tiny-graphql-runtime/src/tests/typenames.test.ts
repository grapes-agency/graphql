import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import { Resolvers } from '../interfaces'

describe('typename', () => {
  it('resolves __typename', async () => {
    const typeDefs = gql`
      type Query {
        test: String
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'works',
      },
    }

    const query = gql`
      query Test {
        test
        __typename
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'works',
      __typename: 'Query',
    })
  })
})
