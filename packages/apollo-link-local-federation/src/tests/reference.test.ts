import { gql } from '@apollo/client/core'
import { createLocalSchemaLink, Resolvers } from '@grapes-agency/apollo-link-local-schema'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils/observablePromise'

import { createOperation } from './createOperation'

describe('reference', () => {
  it('resolves references across services', async () => {
    expect.assertions(4)
    const typeDefsBase = gql`
      extend type User @key(fields: "id") {
        id: ID! @external
      }

      type Post {
        title: String
        text: String
        user: User
      }

      extend type Query {
        post: Post
      }
    `

    const resolversBase: Resolvers = {
      Query: {
        post: () => ({
          title: 'My Title',
          text: 'My Text',
          userId: 'abc',
        }),
      },
      Post: {
        user: root => {
          expect(true).toBe(true)
          return { __typename: 'User', id: root.userId }
        },
      },
    }

    const typeDefsExtension = gql`
      type User @key(fields: "id") {
        id: ID!
        name: String!
      }
    `

    const resovlersExtension: Resolvers = {
      User: {
        __resolveReference(ref) {
          expect(true).toBe(true)
          return { ...ref, name: 'My Username' }
        },
      },
    }

    const query = gql`
      query {
        post {
          title
          text
          user {
            name
          }
        }
      }
    `

    const link = createLocalFederationLink({
      services: [
        {
          name: 'base',
          link: createLocalSchemaLink({ typeDefs: typeDefsBase, resolvers: resolversBase }),
        },
        {
          name: 'extension',
          link: createLocalSchemaLink({ typeDefs: typeDefsExtension, resolvers: resovlersExtension }),
        },
      ],
    })

    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      post: {
        title: 'My Title',
        text: 'My Text',
        user: {
          name: 'My Username',
        },
      },
    })
  })
})
