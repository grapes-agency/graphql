import type { FetchResult, NextLink, Operation } from '@apollo/client'
import { ApolloLink, Observable } from '@apollo/client'
import { proxy, wrap } from 'comlink'

import type { ApolloWorker } from './createApolloWorker'
import './RemoteObservable'
import './RemoteOperation'

export class ApolloWebWorkerLink<Options = Record<string, any>> extends ApolloLink {
  private apolloWorker: ApolloWorker

  constructor(webWorker: Worker, options?: Options) {
    if (!(webWorker instanceof Worker)) {
      throw new Error('ApolloWebWorkerLink needs an initialized Worker')
    }
    super()
    this.apolloWorker = wrap(webWorker) as any
    if (options) {
      this.apolloWorker.setup(options)
    }
  }

  updateOptions(options: Options) {
    this.apolloWorker.setup(options)
  }

  public request(operation: Operation, forward?: NextLink) {
    return new Observable<FetchResult>(observer => {
      let unsubscribe = () => {
        //
      }

      ;(async () => {
        const observable = await this.apolloWorker.request(operation, forward ? proxy(forward) : undefined)
        if (!observable) {
          observer.complete()
          return
        }

        const subscription = observable.subscribe(observer)
        unsubscribe = () => subscription.unsubscribe()
      })()

      return () => unsubscribe()
    })
  }
}

export const createWebWorkerLink = <Options = Record<string, any>>(webWorker: Worker, options?: Options) =>
  new ApolloWebWorkerLink<Options>(webWorker, options)
