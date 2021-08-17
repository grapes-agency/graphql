import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { Resolvers } from '../interfaces'

describe('fragments', () => {
  it('resolves inline fragments', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String!
      }
      type Query {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'abc',
      },
      Test: {
        propA: root => `${root}.A`,
        propB: root => `${root}.B`,
      },
    }

    const query = gql`
      query Test {
        test {
          ... on Test {
            propA
            propB
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'abc.A',
        propB: 'abc.B',
      },
    })
  })

  it('resolves fragments', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String!
      }
      type Query {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'abc',
      },
      Test: {
        propA: root => `${root}.A`,
        propB: root => `${root}.B`,
      },
    }

    const query = gql`
      query Test {
        test {
          ...T
        }
      }
      fragment T on Test {
        propA
        propB
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'abc.A',
        propB: 'abc.B',
      },
    })
  })

  it('resolves fragments asynchronously', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String!
      }
      type Query {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'abc',
      },
      Test: {
        propA: root => new Promise(resolve => setTimeout(() => resolve(`${root}.A`), 10)),
        propB: root => `${root}.B`,
      },
    }

    const query = gql`
      query Test {
        test {
          ...T
        }
      }
      fragment T on Test {
        propA
        propB
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'abc.A',
        propB: 'abc.B',
      },
    })
  })

  it('resolves deep fragments', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String!
      }
      type Query {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'abc',
      },
      Test: {
        propA: root => new Promise(resolve => setTimeout(() => resolve(`${root}.A`), 10)),
        propB: root => `${root}.B`,
      },
    }

    const query = gql`
      query Test {
        test {
          ...T1
        }
      }
      fragment T1 on Test {
        propA
        ...T2
      }
      fragment T2 on Test {
        propB
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        propA: 'abc.A',
        propB: 'abc.B',
      },
    })
  })
})
