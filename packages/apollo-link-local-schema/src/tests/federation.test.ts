import { gql } from '@apollo/client/core'

import { createLocalSchemaLink } from '../LocalSchemaLink'
import type { Resolvers } from '../interfaces'

import { createOperation } from './createOperation'
import { observablePromise } from './observablePromise'

describe('federation', () => {
  it('gets types', () => {
    const typeDefs = gql`
      type Test {
        propA: String
        propB: String
      }
    `

    const link = createLocalSchemaLink({ typeDefs, resolvers: {} })
    const support = link.__addFederationSupport({
      serviceName: 'test-service',
    })

    const testType = support.getType('Test')
    expect(testType).toEqual(typeDefs.definitions[0])
  })

  it('resolves types', async () => {
    expect.assertions(3)

    const typeDefs = gql`
      type Test {
        propA: String
        propB: String
      }
    `

    const resolvers: Resolvers = {
      Test: {
        __resolveReference(ref) {
          expect(ref).toEqual({ id: 'abc' })
          return { propA: 'PropA' }
        },
        propB: () => 'PropB',
      },
    }

    const query = gql`
      query {
        __resolveType(typename: "Test", reference: { id: "abc" }) {
          ... on Test {
            propA
            propB
          }
        }
      }
    `

    const link = createLocalSchemaLink({ typeDefs, resolvers })
    link.__addFederationSupport({
      serviceName: 'test-service',
    })

    const result = await observablePromise(link.request(createOperation(query)))
    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      __resolveType: {
        propA: 'PropA',
        propB: 'PropB',
      },
    })
  })

  it('extends types', async () => {
    expect.assertions(3)

    const typeDefs = gql`
      type Test {
        propC: String
      }
    `

    const resolvers: Resolvers = {
      Test: {
        propC: root => {
          expect(root).toEqual({ id: 'def', __typename: 'Test' })
          return 'PropC'
        },
      },
    }

    const query = gql`
      query {
        __extendType(typename: "Test", parent: { id: "def" }) {
          ... on Test {
            propC
          }
        }
      }
    `

    const link = createLocalSchemaLink({ typeDefs, resolvers })
    link.__addFederationSupport({
      serviceName: 'test-service',
    })

    const result = await observablePromise(link.request(createOperation(query)))
    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      __extendType: {
        propC: 'PropC',
      },
    })
  })
})
