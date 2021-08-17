import { gql } from '@apollo/client/core'
import type { Resolvers } from '@grapes-agency/apollo-link-local-schema'
import { createLocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils/observablePromise'

import { createOperation } from './createOperation'

describe('extension', () => {
  it('extends type across services', async () => {
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

  it('extends lists across servies', async () => {
    const typeDefsBase = gql`
      type Post @key(fields: "id") {
        id: ID!
        title: String
        text: String
      }

      extend type Query {
        posts: [Post]
      }
    `

    const resolversBase: Resolvers = {
      Query: {
        posts: () => [
          {
            id: 'postA',
            title: 'TitleA',
            text: 'TextA',
          },
          {
            id: 'postB',
            title: 'TitleB',
            text: 'TextB',
          },
        ],
      },
    }

    const typeDefsExtension = gql`
      type User {
        name: String!
      }

      extend type Post @key(fields: "id") {
        id: ID!
        user: User!
      }
    `

    const resovlersExtension: Resolvers = {
      Post: {
        user: root => ({
          name: `User for ${root.id}`,
        }),
      },
    }

    const query = gql`
      query {
        posts {
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
      posts: [
        {
          title: 'TitleA',
          text: 'TextA',
          user: {
            name: 'User for postA',
          },
        },
        {
          title: 'TitleB',
          text: 'TextB',
          user: {
            name: 'User for postB',
          },
        },
      ],
    })
  })
})
