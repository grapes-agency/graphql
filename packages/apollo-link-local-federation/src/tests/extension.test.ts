import { gql } from '@apollo/client/core'
import { createLocalSchemaLink, Resolvers } from '@grapes-agency/apollo-link-local-schema'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils/observablePromise'

import { createOperation } from './createOperation'

describe('extension', () => {
  it.only('resolves type across services', async () => {
    expect.assertions(3)
    const typeDefsBase = gql`
      type User @key(fields: "id") {
        id: ID!
        name: String
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
          user: {
            id: 'abc',
            name: 'My Username',
          },
        }),
      },
    }

    const typeDefsExtension = gql`
      extend type User @key(fields: "id") {
        id: ID!
        email: String!
      }
    `

    const resovlersExtension: Resolvers = {
      User: {
        email: root => {
          expect(true).toBe(true)
          return `${root.id}@domain.de`
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
            email
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
          email: 'abc@domain.de',
        },
      },
    })
  })
})
