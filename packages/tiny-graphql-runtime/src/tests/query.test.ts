import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'
import { Resolvers } from '../interfaces'

describe('query', () => {
  it('resolves simple field', async () => {
    const typeDefs = gql`
      type Query {
        test: String
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => 'works',
      },
    }

    const query = gql`
      query Test {
        test
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'works',
    })
  })

  it('resolves simple field with root data', async () => {
    const typeDefs = gql`
      type Query {
        test: String
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: root => `${root} works`,
      },
    }

    const query = gql`
      query Test {
        test
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query, rootData: 'this' })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: 'this works',
    })
  })

  it('resolves fields in parallel', async () => {
    const typeDefs = gql`
      type Query {
        testA: String
        testB: String
      }
    `

    const steps: Array<String> = []

    const resolvers: Resolvers = {
      Query: {
        testA: () => {
          steps.push('start a')
          return new Promise(resolve => {
            setImmediate(() => {
              steps.push('end a')
              resolve('TestA')
            })
          })
        },
        testB: () => {
          steps.push('start b')
          return new Promise(resolve => {
            setImmediate(() => {
              steps.push('end b')
              resolve('TestB')
            })
          })
        },
      },
    }

    const query = gql`
      query Test {
        testA
        testB
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      testA: 'TestA',
      testB: 'TestB',
    })
    expect(steps).toEqual(['start a', 'start b', 'end a', 'end b'])
  })

  it('resolves nested fields', async () => {
    const typeDefs = gql`
      type SubTest {
        subProp: String!
      }
      type Test {
        propA: String!
        propB: SubTest!
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
      SubTest: {
        subProp: root => `${root}.Sub`,
      },
    }

    const query = gql`
      query Test {
        test {
          propA
          propB {
            subProp
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
        propB: {
          subProp: 'abc.B.Sub',
        },
      },
    })
  })

  it('resolves nested fields asynchronously', async () => {
    const typeDefs = gql`
      type SubTest {
        prop: String!
      }
      type Test {
        prop: String!
        sub: SubTest!
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
        prop: root => new Promise(resolve => setTimeout(() => resolve(`${root}.Prop`), 1)),
        sub: () => 'def',
      },
      SubTest: {
        prop: root => new Promise(resolve => setTimeout(() => resolve(`${root}.Prop`), 2)),
      },
    }

    const query = gql`
      query Test {
        test {
          prop
          sub {
            prop
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: {
        prop: 'abc.Prop',
        sub: {
          prop: 'def.Prop',
        },
      },
    })
  })

  it('throws on null', async () => {
    const typeDefs = gql`
      type Query {
        test: String!
      }
    `
    const query = gql`
      query Test {
        test
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers: {} })
    const result = await runtime.execute({ query })

    expect(result.data).toBeNull()
    expect(result.errors!.length).toBe(1)
    expect(result.errors![0].message).toBe('Cannot return null for non-nullable field Query.test')
  })

  it('resolves arrays', async () => {
    const typeDefs = gql`
      type Test {
        propA: String
        propB: String
      }

      type Query {
        test: [Test!]!
      }
    `

    const resolvers: Resolvers = {
      Query: {
        test: () => [{ propA: 'Test #1' }, { propA: 'Test #2' }],
      },
      Test: {
        propB: root => `${root.propA}.B`,
      },
    }

    const query = gql`
      query Test {
        test {
          propA
          propB
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: [
        { propA: 'Test #1', propB: 'Test #1.B' },
        { propA: 'Test #2', propB: 'Test #2.B' },
      ],
    })
  })

  it('returns null', async () => {
    const typeDefs = gql`
      type Test {
        prop: String
      }

      type Query {
        test: String
        list: [Test!]
      }
    `

    const query = gql`
      query Test {
        test
        list {
          prop
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs })
    const result = await runtime.execute({ query })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      test: null,
      list: null,
    })
  })
  it("won't resolve null", async () => {
    const typeDefs = gql`
      type Test {
        propA: String
      }

      type Query {
        test: Test
      }
    `

    const resolvers = {
      Query: {
        test: () => null,
      },
      Test: {
        propA: () => {
          throw new Error('this should not happen')
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        query {
          test {
            propA
          }
        }
      `,
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ test: null })
  })
})
