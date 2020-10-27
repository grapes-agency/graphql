import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'

describe('Directives', () => {
  it('skips fields', async () => {
    const typeDefs = gql`
      directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

      type Test {
        propA: String
        propB: String
      }

      type Query {
        test: Test
      }
    `

    const resolvers = {
      Query: {
        test: () => ({
          _id: 'x',
        }),
      },
      Test: {
        propA: () => 'PropA',
        propB: () => 'PropB',
      },
    }

    const query = gql`
      query($shouldSkip: Boolean!) {
        test {
          propA
          propB @skip(if: $shouldSkip)
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query, args: { shouldSkip: false } })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'PropA',
        propB: 'PropB',
      },
    })

    const result2 = await runtime.execute({ query, args: { shouldSkip: true } })

    expect(result2.errors).toBeUndefined()
    expect(result2.data).toEqual({
      test: {
        propA: 'PropA',
      },
    })
  })
})
