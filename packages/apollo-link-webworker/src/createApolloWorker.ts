/* eslint-disable @typescript-eslint/no-shadow */
import type { FetchResult, NextLink, Operation } from '@apollo/client'
import { ApolloLink, Observable } from '@apollo/client'
import { expose } from 'comlink'

import { setupRemoteObservable } from './RemoteObservable'
import { setupRemoteOperation } from './RemoteOperation'

setupRemoteObservable()
setupRemoteOperation()

type RemoteRequestHandler = (operation: Operation, forward?: NextLink) => Promise<Observable<FetchResult> | null>

const createAsyncLink = () => {
  let release: ((link: ApolloLink | Promise<ApolloLink>) => void) | null = null
  let linkPromise = new Promise<ApolloLink | Promise<ApolloLink>>(resolve => {
    release = link => {
      release = null
      resolve(link)
    }
  })
  return {
    get: () => linkPromise,
    set: (link: ApolloLink | Promise<ApolloLink>) => {
      if (release) {
        release(link)
      } else {
        linkPromise = Promise.resolve(link)
      }
    },
  }
}

const maybeFixDev = () => {
  const anyGlobal = global as any

  if (!('__DEV__' in anyGlobal)) {
    try {
      anyGlobal.__DEV__ = process.env.NODE_ENV !== 'production'
    } catch {
      anyGlobal.__DEV__ = false
    }
  }
}

export interface ApolloWorker {
  setup: (options: Record<string, any>) => Promise<void>
  request: RemoteRequestHandler
}

export const createApolloWorker = <Options = Record<string, any>>(
  apolloLink: ApolloLink | ((options: Options) => ApolloLink | Promise<ApolloLink>)
) => {
  maybeFixDev()
  const link = createAsyncLink()

  if (apolloLink instanceof ApolloLink) {
    link.set(apolloLink)
  }

  const remoteRequestHandler: RemoteRequestHandler = async (operation, forward) => {
    let next: NextLink | undefined
    if (forward) {
      next = operation =>
        new Observable(observer => {
          let unsubscribe = () => {
            //
          }

          ;(forward(operation) as unknown as Promise<Observable<FetchResult>>).then(observable => {
            const subscription = observable.subscribe({
              next: data => observer.next(data),
              error: error => observer.error(error),
              complete: () => observer.complete(),
            })
            unsubscribe = () => subscription.unsubscribe()
          })

          return () => unsubscribe()
        })
    }

    return (await link.get()).request(operation, next)
  }

  expose({
    setup: (options: Options) => {
      if (apolloLink instanceof ApolloLink) {
        throw new Error('cannot setup apollo worker without create function')
      }

      link.set(apolloLink(options))
    },
    request: remoteRequestHandler,
  })

  class FakeWorker {
    constructor() {
      throw new Error('You did not properly loaded the link as Worker')
    }
  }

  return FakeWorker as new () => Worker
}
