import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { Resolvers } from '../interfaces'

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
        query ($testArg: String) {
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
        query ($testArg: String!) {
          test(name: $testArg)
        }
      `,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors![0].message).toEqual('Missing variable testArg')
  })

  it('validates args', async () => {
    expect.assertions(7)
    const typeDefs = gql`
      enum Side {
        LEFT
        RIGHT
      }

      input Address {
        street: String
        side: Side
      }

      input Data {
        name: String!
        age: Int
        address: Address!
      }

      type Mutation {
        update(data: Data!): Int
      }
    `

    const resolvers: Resolvers = {
      Mutation: {
        update: (_root, args) => {
          expect(args).toEqual({
            data: {
              name: 'x',
              age: 10,
              address: {
                side: 'LEFT',
                street: null,
              },
            },
          })

          return args.data.age
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    let result = await runtime.execute({
      query: gql`
        mutation ($data: Data!) {
          update(data: $data)
        }
      `,
      args: {
        data: {},
      },
    })

    expect(result.data!.update).toBeNull()
    expect(result.errors![0].message).toEqual('Cannot use null for non-nullable argument data.name')

    result = await runtime.execute({
      query: gql`
        mutation ($data: Data!) {
          update(data: $data)
        }
      `,
      args: {
        data: {
          name: 'x',
          address: {
            side: 'UP',
          },
        },
      },
    })

    expect(result.data!.update).toBeNull()
    expect(result.errors![0].message).toEqual('Enum "Side" cannot represent value: "UP"')

    result = await runtime.execute({
      query: gql`
        mutation ($data: Data!) {
          update(data: $data)
        }
      `,
      args: {
        data: {
          name: 'x',
          age: 10,
          address: {
            side: 'LEFT',
          },
        },
      },
    })

    expect(result.errors).toBeUndefined()
    expect(result.data!.update).toEqual(10)
  })
})
