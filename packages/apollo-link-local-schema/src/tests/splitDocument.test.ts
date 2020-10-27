import { gql, concat } from '@apollo/client/core'

import { createLocalSchemaLink } from '../LocalSchemaLink'

import { createOperation } from './createOperation'
import { observablePromise } from './observablePromise'

describe('Document split', () => {
  it('splits local and extrnal document', async () => {
    const linkA = createLocalSchemaLink({
      typeDefs: gql`
        type TestA {
          propA: String
        }

        type Query {
          testA: TestA
        }
      `,
      resolvers: {
        Query: {
          testA: () => ({ propA: 'PropA' }),
        },
      },
    })

    const linkB = createLocalSchemaLink({
      typeDefs: gql`
        type TestB {
          propB: String
        }

        type Query {
          testB: TestB
        }
      `,
      resolvers: {
        Query: {
          testB: () => ({ propB: 'PropB' }),
        },
      },
    })

    const query = gql`
      query {
        testA {
          propA
        }
        testB {
          propB
        }
      }
    `

    const combinedLink = concat(linkA, linkB)

    const result = await observablePromise(combinedLink.request(createOperation(query)))
    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      testA: {
        propA: 'PropA',
      },
      testB: {
        propB: 'PropB',
      },
    })
  })
})
