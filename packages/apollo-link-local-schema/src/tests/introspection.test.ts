import { gql } from '@apollo/client/core'
import { getIntrospectionQuery } from 'graphql'

import { createLocalSchemaLink } from '../LocalSchemaLink'

import { createOperation } from './createOperation'
import { observablePromise } from './observablePromise'

describe('introspection', () => {
  it('resovles __schema', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
      }

      type Query {
        test: Test
      }
    `

    const query = gql(getIntrospectionQuery())
    const link = createLocalSchemaLink({ typeDefs, resolvers: {} })
    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data!.__schema.queryType.name).toEqual('Query')
  })

  it('resovles __type', async () => {
    const typeDefs = gql`
      """
      A nice test type
      """
      type Test {
        propA: String!
      }

      type Query {
        test: Test
      }
    `

    const query = gql`
      query {
        __type(name: "Test") {
          name
          description
        }
      }
    `
    const link = createLocalSchemaLink({ typeDefs, resolvers: {} })
    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      __type: {
        name: 'Test',
        description: 'A nice test type',
      },
    })
  })
})
