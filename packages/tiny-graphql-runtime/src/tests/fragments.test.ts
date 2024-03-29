import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import type { Resolvers } from '../interfaces'

describe('fragments', () => {
  it('resolves inline fragments', async () => {
    const typeDefs = gql`
      type Test {
        propA: String!
        propB: String!
        propC: String!
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
        propC: root => `${root}.C`,
      },
    }

    const query = gql`
      query Test {
        test {
          ... on Test {
            propA
            ... on Test {
              propB
              ... on Test {
                propC
              }
            }
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
        propC: 'abc.C',
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

  it('merges multiple fragments', async () => {
    const typeDefs = gql`
      type Prop {
        a: String!
        b: String!
      }
      type Test {
        prop: Prop!
      }
      type Query {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => ({ prop: { a: 'A', b: 'B' } }),
      },
    }

    const query = gql`
      query Test {
        test {
          ...F1
          ...F2
        }
      }
      fragment F1 on Test {
        prop {
          a
        }
      }
      fragment F2 on Test {
        prop {
          b
        }
      }
    `
    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        prop: {
          a: 'A',
          b: 'B',
        },
      },
    })
  })
  it('applies fragments to the correct type', async () => {
    const typeDefs = gql`
      interface GenericProp {
        generic: String!
      }

      type AProp implements GenericProp {
        generic: String!
        a: String!
      }

      type BProp implements GenericProp {
        generic: String!
        b: String!
      }

      type Query {
        test: [GenericProp!]!
      }
    `

    const resolvers: Resolvers = {
      GenericProp: {
        __resolveType: data => (data.type === 'A' ? 'AProp' : 'BProp'),
      },
      Query: {
        test: () => [
          { generic: 'GENERIC_1', type: 'A' },
          { generic: 'GENERIC_2', type: 'A' },
          { generic: 'GENERIC_3', type: 'A' },
        ],
      },
      AProp: {
        a: () => 'A',
      },
    }

    const query = gql`
      query Test {
        test {
          generic
          ...Fragment
        }
      }
      fragment Fragment on AProp {
        a
      }
    `
    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: [
        { generic: 'GENERIC_1', a: 'A' },
        { generic: 'GENERIC_2', a: 'A' },
        { generic: 'GENERIC_3', a: 'A' },
      ],
    })
  })

  it('works with fragments on interfaces', async () => {
    const typeDefs = gql`
      interface ScreenItem {
        id: ID!
      }

      type AppScreenItem implements ScreenItem {
        id: ID!
      }

      type Query {
        screenItems: [ScreenItem!]!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        screenItems: () => [null],
      },
      ScreenItem: {
        __resolveType: () => 'AppScreenItem',
      },
      AppScreenItem: {
        id: () => 'a',
      },
    }

    const query = gql`
      query Overview {
        screenItems {
          ...Item
        }
      }

      fragment Item on ScreenItem {
        __typename
        id
      }
    `
    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data!.screenItems[0]).toEqual({
      __typename: 'AppScreenItem',
      id: 'a',
    })
  })

  it.only('works with inline fragments on interfaces', async () => {
    const typeDefs = gql`
      interface ScreenItem {
        id: ID!
      }

      type AppScreenItem implements ScreenItem {
        id: ID!
      }

      type Query {
        screenItems: [ScreenItem!]!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        screenItems: () => [null],
      },
      ScreenItem: {
        __resolveType: () => 'AppScreenItem',
      },
      AppScreenItem: {
        id: () => 'a',
      },
    }

    const query = gql`
      query Overview {
        screenItems {
          ... on ScreenItem {
            __typename
            id
          }
        }
      }
    `
    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data!.screenItems[0]).toEqual({
      __typename: 'AppScreenItem',
      id: 'a',
    })
  })
})
