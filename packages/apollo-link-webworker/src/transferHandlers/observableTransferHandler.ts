import { Observable } from '@apollo/client'
import type * as Comlink from 'comlink'
import type { ExecutionResult } from 'graphql'

import { deserializeObject, serializeObject } from '../utils'

export const observableTransferHandler: Comlink.TransferHandler<Observable<ExecutionResult>, MessagePort> = {
  canHandle: (obj: any): obj is Observable<any> => obj instanceof Observable,
  serialize: observable => {
    const { port1, port2 } = new MessageChannel()

    port1.start()
    port1.addEventListener('message', event => {
      if (!(event.data === 'subscribe' && event.ports)) {
        return
      }

      const [port] = event.ports
      port.start()
      const subscription = observable.subscribe({
        next: next => port.postMessage({ next: { ...next, errors: serializeObject(next.errors)[0] } }),
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
  deserialize: port => {
    port.start()

    return new Observable<any>(observer => {
      const { port1, port2 } = new MessageChannel()

      port1.start()
      port.postMessage('subscribe', [port2])

      const handleMessage = ({ data }: MessageEvent) => {
        if (data.next) {
          observer.next({
            ...data.next,
            errors: deserializeObject(data.next.errors),
          })
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
}
