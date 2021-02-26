import { FetchResult, Observable } from '@apollo/client/core'

export const mergeObservables = (...sources: Array<Observable<FetchResult>>) =>
  new Observable<FetchResult>(observer => {
    let count = sources.length
    const combinedResult: FetchResult = { data: {}, errors: [] }
    const subscriptions = sources.map(source =>
      source.subscribe({
        next: ({ data, errors }) => {
          Object.assign(combinedResult.data, data)
          if (errors) {
            combinedResult.errors = [...combinedResult.errors!, ...errors]
          }
        },
        error: error => observer.error(error),
        complete: () => {
          if (--count === 0) {
            observer.next(combinedResult)
            observer.complete()
          }
        },
      })
    )

    return () => subscriptions.forEach(subscription => subscription.unsubscribe())
  })
