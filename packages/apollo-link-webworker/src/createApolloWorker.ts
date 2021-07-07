/* eslint-disable @typescript-eslint/no-shadow */
import { ApolloLink, FetchResult, NextLink, Observable, Operation } from '@apollo/client'
import { expose } from 'comlink'
import './RemoteObservable'
import './RemoteOperation'

type RemoteRequestHandler = (operation: Operation, forward?: NextLink) => Promise<Observable<FetchResult> | null>

export interface ApolloWorker {
  setup: (options: Record<string, any>) => Promise<void>
  request: RemoteRequestHandler
}

export const createApolloWorker = (
  apolloLink: ApolloLink | ((options: Record<string, any>) => ApolloLink | Promise<ApolloLink>)
) => {
  let link: Promise<ApolloLink>

  const remoteRequestHandler: RemoteRequestHandler = async (operation, forward) => {
    let next: NextLink | undefined
    if (forward) {
      next = operation =>
        new Observable(observer => {
          let unsubscribe = () => {
            //
          }

          ;((forward(operation) as unknown) as Promise<Observable<FetchResult>>).then(observable => {
            const subscription = observable.subscribe(observer)
            unsubscribe = () => subscription.unsubscribe()
          })

          return () => unsubscribe()
        })
    }

    return (await link).request(operation, next)
  }

  expose({
    setup: (options: Record<string, any>) => {
      link = Promise.resolve(apolloLink instanceof ApolloLink ? apolloLink : apolloLink(options))
    },
    request: remoteRequestHandler,
  })
}
