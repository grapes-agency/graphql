import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { SchemaDirectiveVisitor } from '../SchemaDirectiveVisitor'
import { isFieldResolver } from '../helpers'
import type { Resolvers } from '../interfaces'

describe('Directives', () => {
  it('skips fields', async () => {
    const typeDefs = gql`
      directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

      type Test {
        propA: String
        propB: String
      }

      type Query {
        test: Test
      }
    `

    const resolvers = {
      Query: {
        test: () => ({
          _id: 'x',
        }),
      },
      Test: {
        propA: () => 'PropA',
        propB: () => 'PropB',
      },
    }

    const query = gql`
      query ($shouldSkip: Boolean!) {
        test {
          propA
          propB @skip(if: $shouldSkip)
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query, args: { shouldSkip: false } })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'PropA',
        propB: 'PropB',
      },
    })

    const result2 = await runtime.execute({ query, args: { shouldSkip: true } })

    expect(result2.errors).toBeUndefined()
    expect(result2.data).toEqual({
      test: {
        propA: 'PropA',
      },
    })
  })

  it('supports schema directives', async () => {
    const visitor: SchemaDirectiveVisitor = {
      visitFieldDefinition(field, args) {
        const { resolve } = field
        if (!isFieldResolver(resolve)) {
          return
        }
        field.resolve = async (...params) => {
          const result = await resolve(...params)
          if (typeof result === 'string') {
            if (args.type === 'UPPER') {
              return result.toUpperCase()
            } else if (args.type === 'LOWER') {
              return result.toLowerCase()
            }
            return result
          }
        }
      },
    }

    const typeDefs = gql`
      enum CASE_TYPE {
        UPPER
        LOWER
      }

      directive @case(type: CASE_TYPE!) on FIELD_DEFINITION

      type Test {
        propA: String @case(type: "UPPER")
        propB: String @case(type: "LOWER")
      }

      type Query {
        test: Test
      }
    `

    const resolvers: Resolvers = {
      Test: {
        propA: root => `${root.propA}xyz`,
      },
      Query: {
        test: () => ({ propA: 'abc', propB: 'DEF' }),
      },
    }

    const query = gql`
      query {
        test {
          propA
          propB
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers, schemaDirectives: { case: visitor } })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'ABCXYZ',
        propB: 'def',
      },
    })
  })

  it('supports non standard input value resolver', async () => {
    expect.assertions(2)
    const visitor: SchemaDirectiveVisitor = {
      visitInputValueDefinition(input) {
        input.resolve = root => {
          if (Array.isArray(root)) {
            return [...root, 'y']
          }

          return `${root}y`
        }
      },
    }

    const typeDefs = gql`
      directive @test on INPUT_FIELD_DEFINITION

      input Data {
        prop: String @test
        list: [String!]! @test
      }

      type Mutation {
        test(data: Data): Boolean
      }
    `

    const resolvers: Resolvers = {
      Mutation: {
        test: (_root, args) => {
          expect(args).toEqual({
            data: {
              prop: 'xy',
              list: ['xy', 'yy'],
            },
          })
          return true
        },
      },
    }

    const query = gql`
      mutation {
        test(data: { prop: "x", list: ["x"] })
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers, schemaDirectives: { test: visitor } })
    const result = await runtime.execute({ query })
    expect(result.errors).toBeUndefined()
  })
})
