import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'

describe('simple usage', () => {
  it('can query plain objects', async () => {
    const data = {
      post: {
        title: 'My Title',
        text: 'My Text',
        user: {
          id: 'userId',
          name: 'My username',
        },
      },
    }

    const typeDefs = gql`
      type User {
        id: ID
        name: String
      }
      type Post {
        title: String
        text: String
        user: User
      }

      type Query {
        post: Post
      }
    `

    const query = gql`
      query {
        post {
          title
          user {
            name
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs })

    const result = await runtime.execute({ query, rootData: data })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      post: {
        title: 'My Title',
        user: { name: 'My username' },
      },
    })
  })
})
