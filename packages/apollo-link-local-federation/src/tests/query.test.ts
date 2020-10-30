import { gql } from '@apollo/client/core'
import { createLocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import type { Resolvers } from '@grapes-agency/tiny-graphql-runtime'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils/observablePromise'

import { createOperation } from './createOperation'

describe('Link', () => {
  it('resolves simple query', async () => {
    const typeDefs = gql`
      type TestA {
        propA: String
      }

      extend type Query {
        testA: TestA
      }
    `

    const resolvers: Resolvers = {
      Query: {
        testA: () => ({ propA: 'PropA' }),
      },
    }

    const link = createLocalFederationLink({
      services: [
        {
          name: 'simple',
          link: createLocalSchemaLink({ typeDefs, resolvers }),
        },
      ],
    })

    const query = gql`
      query {
        testA {
          propA
        }
      }
    `

    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      testA: {
        propA: 'PropA',
      },
    })
  })

  it('resolves joined query', async () => {
    const typeDefsA = gql`
      type TestA {
        propA: String
      }

      extend type Query {
        testA: TestA
      }
    `

    const resolversA: Resolvers = {
      Query: {
        testA: () => ({ propA: 'PropA' }),
      },
    }

    const typeDefsB = gql`
      type TestB {
        propB: String
      }

      extend type Query {
        testB: TestB
      }
    `

    const resolversB: Resolvers = {
      Query: {
        testB: () => ({ propB: 'PropB' }),
      },
    }
    const link = createLocalFederationLink({
      services: [
        {
          name: 'simpleA',
          link: createLocalSchemaLink({ typeDefs: typeDefsA, resolvers: resolversA }),
        },
        {
          name: 'simpleB',
          link: createLocalSchemaLink({ typeDefs: typeDefsB, resolvers: resolversB }),
        },
      ],
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

    const result = await observablePromise(link.request(createOperation(query)))

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
