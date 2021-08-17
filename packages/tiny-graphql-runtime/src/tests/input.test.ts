import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { Resolvers } from '../interfaces'

describe('Inputs', () => {
  it('resolves inputs via resolvers object', async () => {
    const typeDefs = gql`
      input Input {
        name: String
      }
      type Mutation {
        test(input: Input): String!
      }
    `

    const resolvers: Resolvers = {
      Input: {
        name: (root, context) => context.transformer(root),
      },
      Mutation: {
        test: (_root, args) => args.input.name,
      },
    }

    const runtime = new GraphQLRuntime({
      typeDefs,
      resolvers,
    })
    const result = await runtime.execute({
      context: {
        transformer: (str: string) => `transformed_${str}`,
      },
      query: gql`
        mutation {
          test(input: { name: "original" })
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'transformed_original',
    })
  })

  it('resolves inputs via schema directives', async () => {
    const typeDefs = gql`
      directive @transform on INPUT_FIELD_DEFINITION

      input Input {
        name: String @transform
      }
      type Mutation {
        test(input: Input): String!
      }
    `

    const resolvers: Resolvers = {
      Mutation: {
        test: (_root, args) => args.input.name,
      },
    }

    const runtime = new GraphQLRuntime({
      typeDefs,
      resolvers,
      schemaDirectives: {
        transform: {
          visitInputValueDefinition: input => {
            input.resolve = root => `transformed_${root}`
          },
        },
      },
    })
    const result = await runtime.execute({
      query: gql`
        mutation {
          test(input: { name: "original" })
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'transformed_original',
    })
  })

  it('resolves input asynchronously', async () => {
    const typeDefs = gql`
      input Input {
        name: String
      }
      type Mutation {
        test(input: Input): String!
      }
    `

    const resolvers: Resolvers = {
      Input: {
        name: root => new Promise(resolve => resolve(`async_${root}`)),
      },
      Mutation: {
        test: (_root, args) => args.input.name,
      },
    }

    const runtime = new GraphQLRuntime({
      typeDefs,
      resolvers,
    })
    const result = await runtime.execute({
      query: gql`
        mutation {
          test(input: { name: "original" })
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'async_original',
    })
  })
})
