import { gql } from '@apollo/client/core'

import { createLocalSchemaLink } from '../LocalSchemaLink'

import { createOperation } from './createOperation'
import { observablePromise } from './observablePromise'

describe('LocalSchemaLink', () => {
  it('resolves', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String
      }

      type Query {
        test: Test
      }
    `

    const resolvers = {
      Query: {
        test: () => ({
          propA: 'abc',
          propB: 'def',
        }),
      },
    }

    const query = gql`
      query {
        test {
          propA
          propB
        }
      }
    `

    const link = createLocalSchemaLink({
      typeDefs,
      resolvers,
    })

    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      test: {
        propA: 'abc',
        propB: 'def',
      },
    })
  })
})
