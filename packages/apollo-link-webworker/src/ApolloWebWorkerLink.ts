import { ApolloLink, FetchResult, NextLink, Observable, Operation } from '@apollo/client'
import { proxy, wrap } from 'comlink'

import type { ApolloWorker } from './createApolloWorker'
import './RemoteObservable'
import './RemoteOperation'

export class ApolloWebWorkerLink extends ApolloLink {
  private apolloWorker: ApolloWorker

  constructor(webWorker: Worker, protected options: Record<string, any> = {}) {
    super()
    this.apolloWorker = wrap(webWorker) as any
    this.apolloWorker.setup(this.options)
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

export const createWebWorkerLink = (webWorker: Worker, options?: Record<string, any>) =>
  new ApolloWebWorkerLink(webWorker, options)
