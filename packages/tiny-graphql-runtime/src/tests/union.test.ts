import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import { Resolvers } from '../interfaces'

describe('Union', () => {
  it('resolves single unions', async () => {
    expect.assertions(3)
    const typeDefs = gql`
      union Result = Book | Author

      type Book {
        title: String
      }

      type Author {
        name: String
      }

      type Query {
        search: Result
      }
    `

    const resolvers: Resolvers = {
      Result: {
        __resolveType(obj) {
          expect(obj).toEqual({
            name: 'Author A',
          })
          return 'Author'
        },
      },
      Query: {
        search: () => ({
          name: 'Author A',
        }),
      },
    }

    const query = gql`
      query Test {
        search {
          ... on Author {
            name
            __typename
          }
          ... on Book {
            title
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      search: {
        name: 'Author A',
        __typename: 'Author',
      },
    })
  })

  it('resolves array of unions', async () => {
    const typeDefs = gql`
      union Result = Book | Author

      type Book {
        title: String
      }

      type Author {
        name: String
      }

      type Query {
        search: [Result]
      }
    `

    const resolvers: Resolvers = {
      Result: {
        __resolveType(obj) {
          if ('name' in obj) {
            return 'Author'
          }
          return 'Book'
        },
      },
      Query: {
        search: () => [
          {
            name: 'Author A',
          },
          {
            title: 'Book A',
          },
          {
            name: 'Author B',
          },
        ],
      },
    }

    const query = gql`
      query Test {
        search {
          ... on Author {
            name
            __typename
          }
          ... on Book {
            title
            __typename
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      search: [
        {
          name: 'Author A',
          __typename: 'Author',
        },
        {
          title: 'Book A',
          __typename: 'Book',
        },
        {
          name: 'Author B',
          __typename: 'Author',
        },
      ],
    })
  })
})
