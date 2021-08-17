import { DateTimeResolver } from 'graphql-scalars'
import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { Resolvers } from '../interfaces'

describe('Scalar', () => {
  it('resolves scalars', async () => {
    const typeDefs = gql`
      scalar DateTime

      type Query {
        now: DateTime
      }
    `

    const resolvers: Resolvers = {
      DateTime: DateTimeResolver,
      Query: {
        now: () => new Date().toISOString(),
      },
    }

    const query = gql`
      query Test {
        now
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data!.now).toBeInstanceOf(Date)
  })
})
