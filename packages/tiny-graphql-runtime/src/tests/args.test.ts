import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import { Resolvers } from '../interfaces'

describe('Arguments', () => {
  it('respects arguments', async () => {
    expect.assertions(3)
    const typeDefs = gql`
      type Query {
        test(name: String): String!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test(_root, args) {
          expect(args).toEqual({
            name: 'arg',
          })
          return 'Test'
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        query {
          test(name: "arg")
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'Test',
    })
  })

  it('respects argument default value', async () => {
    expect.assertions(3)
    const typeDefs = gql`
      type Query {
        test(name: String = "default"): String!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test(_root, args) {
          expect(args).toEqual({
            name: 'default',
          })
          return 'Test'
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        query {
          test
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'Test',
    })
  })

  it('respects provided arguments', async () => {
    expect.assertions(3)
    const typeDefs = gql`
      type Query {
        test(name: String = "default"): String!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test(_root, args) {
          expect(args).toEqual({
            name: 'TEST_ARG',
          })
          return 'Test'
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      args: {
        testArg: 'TEST_ARG',
      },
      query: gql`
        query($testArg: String) {
          test(name: $testArg)
        }
      `,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'Test',
    })
  })
  it('throws on null for non-nullable arg', async () => {
    expect.assertions(2)
    const typeDefs = gql`
      type Query {
        test(name: String!): String!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test(_root) {
          expect(true).toEqual(true)
          return 'Test'
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        query {
          test
        }
      `,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors![0].message).toEqual('Cannot use null for non-nullable argument name')
  })

  it('throws on missing args', async () => {
    expect.assertions(2)
    const typeDefs = gql`
      type Query {
        test(name: String = "default"): String!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test(_root) {
          expect(true).toEqual(true)
          return 'Test'
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        query($testArg: String!) {
          test(name: $testArg)
        }
      `,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors![0].message).toEqual('Missing variable testArg')
  })
})
