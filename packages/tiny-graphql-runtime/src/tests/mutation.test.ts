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
})
