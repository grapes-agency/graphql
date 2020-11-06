import gql from 'graphql-tag'
import Observable from 'zen-observable'

import { GraphQLRuntime } from '../GraphQLRuntime'
import { Resolvers } from '../interfaces'

const fakeAsyncIterator = <T>(callback: (push: (data: T) => void) => void | (() => void)): AsyncIterator<T> => {
  let resolvePromise: (data: T) => void

  const push = (data: T) => resolvePromise?.(data)

  let initialized = false
  let cleanup: void | (() => void)

  return {
    next() {
      return new Promise(resolve => {
        resolvePromise = value => resolve({ value, done: false })
        if (!initialized) {
          initialized = true
          cleanup = callback(push)
        }
      })
    },
    async return() {
      cleanup && cleanup()
      return { done: true, value: null }
    },
  }
}

describe('Subscriptions', () => {
  it('resolve simple notification', async callback => {
    const typeDefs = gql`
      type Test {
        prop: String!
      }

      type Subscription {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Subscription: {
        test: {
          subscribe: () =>
            fakeAsyncIterator(push => {
              push({ test: 'abc' })
            }),
        },
      },
      Test: {
        prop: root => `${root}.prop`,
      },
    }

    const query = gql`
      subscription Test {
        test {
          prop
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })

    const result = await runtime.execute({ query })

    expect(result!.errors).toBeUndefined()
    expect(result!.data!.test).toBeInstanceOf(Observable)

    const observable: Observable<any> = result!.data!.test

    observable.subscribe({
      next: data => {
        expect(data).toEqual({
          test: { prop: 'abc.prop' },
        })
        callback()
      },
      error: error => {
        throw error
      },
    })
  })

  it('resolve nested notification', async callback => {
    const typeDefs = gql`
      type Test {
        prop: Sub
      }

      type Sub {
        propSub: String
      }

      type Subscription {
        test: Test!
      }
    `

    const resolvers: Resolvers = {
      Subscription: {
        test: {
          subscribe: () =>
            fakeAsyncIterator(push => {
              push({ test: 'abc' })
            }),
        },
      },
      Test: {
        prop: root => `${root}.prop`,
      },

      Sub: {
        propSub: root => `${root}.sub`,
      },
    }

    const query = gql`
      subscription Test {
        test {
          prop {
            propSub
          }
        }
      }
    `

    const runtime = new GraphQLRuntime({ typeDefs, resolvers })

    const result = await runtime.execute({ query })

    expect(result!.errors).toBeUndefined()
    expect(result!.data!.test).toBeInstanceOf(Observable)

    const observable: Observable<any> = result!.data!.test

    observable.subscribe({
      next: data => {
        expect(data).toEqual({
          test: { prop: { propSub: 'abc.prop.sub' } },
        })
        callback()
      },
      error: error => {
        throw error
      },
    })
  })
})
