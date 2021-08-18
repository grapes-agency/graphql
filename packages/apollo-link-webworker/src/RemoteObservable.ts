import { Observable } from '@apollo/client'
import * as Comlink from 'comlink'
import type { ExecutionResult } from 'graphql'

// eslint-disable-next-line handle-callback-err
const objectifyError = <E extends Error>(error: E) =>
  Object.fromEntries(
    (Object.getOwnPropertyNames(error) as Array<keyof E>).map(propertyName => [propertyName, error[propertyName]])
  )

Comlink.transferHandlers.set('OBSERVABLE', {
  canHandle: (obj: any): obj is Observable<any> => obj instanceof Observable,
  serialize: (observable: Observable<ExecutionResult>) => {
    const { port1, port2 } = new MessageChannel()

    port1.start()
    port1.addEventListener('message', event => {
      if (!(event.data === 'subscribe' && event.ports)) {
        return
      }

      const [port] = event.ports
      port.start()
      const subscription = observable.subscribe({
        next: next => port.postMessage({ next: { ...next, errors: next.errors?.map(objectifyError) || undefined } }),
        error: (error: any) => port.postMessage({ error }),
        complete: () => port.postMessage({ complete: true }),
      })

      port.addEventListener('message', ({ data }) => {
        if (data === 'unsubscribe') {
          subscription.unsubscribe()
        }
      })
    })

    return [port2, [port2]]
  },
  deserialize: (port: MessagePort) => {
    port.start()

    return new Observable<any>(observer => {
      const { port1, port2 } = new MessageChannel()

      port1.start()
      port.postMessage('subscribe', [port2])

      const handleMessage = ({ data }: MessageEvent) => {
        if (data.next) {
          observer.next(data.next)
        } else if (data.error) {
          observer.error(data.error)
        } else if (data.complete) {
          observer.complete()
        }
      }

      port1.addEventListener('message', handleMessage)

      return () => {
        port1.removeEventListener('message', handleMessage)
        port1.postMessage('unsubscribe')
      }
    })
  },
})

export { Observable }
