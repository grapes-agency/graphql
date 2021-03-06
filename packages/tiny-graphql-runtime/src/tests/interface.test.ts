import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'

describe('interfaces', () => {
  it('resolves types', async () => {
    const typeDefs = gql`
      interface Book {
        title: String
        author: String
      }

      type TextBook implements Book {
        title: String
        author: String
        class: String
      }

      type ColoringBook implements Book {
        title: String
        author: String
        colors: [String!]!
      }

      type Query {
        schoolBooks: [Book]
      }
    `

    const resolvers = {
      Book: {
        __resolveType(book: any) {
          if ('class' in book) {
            return 'TextBook'
          }

          if ('colors' in book) {
            return 'ColoringBook'
          }

          return null
        },
      },
      Query: {
        schoolBooks: () => [
          {
            title: 'TextBook',
            author: 'TextBookAuthor',
            class: 'senior',
          },
          {
            title: 'ColoringBook',
            author: 'ColoringBookAuthor',
            colors: ['red', 'blue'],
          },
        ],
      },
    }

    const query = gql`
      query {
        schoolBooks {
          title
          author
          ... on TextBook {
            class
          }
          ... on ColoringBook {
            colors
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      schoolBooks: [
        {
          title: 'TextBook',
          author: 'TextBookAuthor',
          class: 'senior',
        },
        {
          title: 'ColoringBook',
          author: 'ColoringBookAuthor',
          colors: ['red', 'blue'],
        },
      ],
    })
  })

  it('uses interface and type resolvers', async () => {
    const typeDefs = gql`
      interface Book {
        title: String
        author: String
      }

      type TextBook implements Book {
        title: String
        author: String
        class: String
      }

      type ColoringBook implements Book {
        title: String
        author: String
        colors: [String!]!
      }

      type Query {
        schoolBooks: [Book]
      }
    `

    const resolvers = {
      Book: {
        __resolveType(book: any) {
          if ('class' in book) {
            return 'TextBook'
          }

          if ('colors' in book) {
            return 'ColoringBook'
          }

          return null
        },
        author: (root: any) => root.writer,
      },
      TextBook: {
        title: (root: any) => `TextBook: ${root.title}`,
      },
      ColoringBook: {
        title: (root: any) => `ColoringBook: ${root.title}`,
      },
      Query: {
        schoolBooks: () => [
          {
            title: 'TextBook',
            writer: 'TextBookAuthor',
            class: 'senior',
          },
          {
            title: 'ColoringBook',
            writer: 'ColoringBookAuthor',
            colors: ['red', 'blue'],
          },
        ],
      },
    }

    const query = gql`
      query {
        schoolBooks {
          title
          author
          ... on TextBook {
            class
          }
          ... on ColoringBook {
            colors
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      schoolBooks: [
        {
          title: 'TextBook: TextBook',
          author: 'TextBookAuthor',
          class: 'senior',
        },
        {
          title: 'ColoringBook: ColoringBook',
          author: 'ColoringBookAuthor',
          colors: ['red', 'blue'],
        },
      ],
    })
  })
})
