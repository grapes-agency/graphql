import Observable from 'zen-observable'

import type { ResolveInfo, SubscriptionResolver } from './interfaces'

export const asyncIteratorToObservable = (
  resolver: SubscriptionResolver<any>,
  rootValue: any,
  args: any,
  context: any,
  info: ResolveInfo
) =>
  new Observable(observer => {
    let stopped = false
    let asyncIterator: AsyncIterator<any>
    Promise.resolve(resolver.subscribe(rootValue, args, context, info)).then(ai => {
      asyncIterator = ai
      if (stopped) {
        return
      }

      const pullValue = () => {
        asyncIterator
          .next()
          .then(nextValue => {
            if (resolver.resolve) {
              nextValue = resolver.resolve(nextValue, args, context, info)
            }

            Promise.resolve(nextValue).then(data => {
              if (stopped) {
                return
              }

              observer.next(data.value)
            })

            pullValue()
          })
          .catch(error => {
            observer.error(error)
          })
      }

      pullValue()
    })

    return () => {
      asyncIterator?.return?.()
      stopped = true
    }
  })
