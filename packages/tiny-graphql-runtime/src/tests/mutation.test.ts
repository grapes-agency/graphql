import { GraphQLError } from 'graphql'
import gql from 'graphql-tag'

import { GraphQLRuntime } from '../GraphQLRuntime'

describe('mutations', () => {
  it('runs mutations sequentially', async () => {
    const typeDefs = gql`
      type Mutation {
        mutationA: String!
        mutationB: String!
        mutationC: String!
      }
    `

    const resolved: Array<string> = []

    const resolvers = {
      Mutation: {
        mutationA: () =>
          new Promise(resolve =>
            setTimeout(() => {
              resolved.push('A')
              return resolve('resultA')
            }, 30)
          ),
        mutationB: () =>
          new Promise(resolve =>
            setTimeout(() => {
              resolved.push('B')
              return resolve('resultB')
            }, 20)
          ),
        mutationC: () =>
          new Promise(resolve =>
            setTimeout(() => {
              resolved.push('C')
              return resolve('resultC')
            }, 10)
          ),
      },
    }

    const mutation = gql`
      mutation {
        mutationA
        mutationB
        mutationC
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({ query: mutation })

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({
      mutationA: 'resultA',
      mutationB: 'resultB',
      mutationC: 'resultC',
    })
    expect(resolved).toEqual(['A', 'B', 'C'])
  })

  it('passes through errors', async () => {
    const typeDefs = gql`
      type Mutation {
        execute: String!
      }
    `

    const resolvers = {
      Mutation: {
        execute: () => {
          throw new GraphQLError('custom error')
        },
      },
    }

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })
    const result = await runtime.execute({
      query: gql`
        mutation {
          execute
        }
      `,
    })

    expect(result.data).toBeNull()
    expect(result.errors!.length).toEqual(1)
    expect(result.errors![0].message).toEqual('custom error')
  })
})
