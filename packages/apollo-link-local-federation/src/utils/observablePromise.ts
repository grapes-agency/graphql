import type { Observable } from '@apollo/client/core'

export const observablePromise = <T>(observable: Observable<T> | null): Promise<T | null> => {
  if (observable === null) {
    return Promise.reject(new Error('No observable'))
  }

  return new Promise((resolve, reject) => {
    const subscription = observable.subscribe({
      next: data => {
        subscription.unsubscribe()
        resolve(data)
      },
      error: error => {
        subscription.unsubscribe()
        reject(error)
      },
    })
  })
}
