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
          .then(({ value }) => {
            if (resolver.resolve) {
              value = resolver.resolve(value, args, context, info)
            }

            Promise.resolve(value).then(resolvedValue => {
              if (stopped) {
                return
              }

              observer.next(resolvedValue)
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
