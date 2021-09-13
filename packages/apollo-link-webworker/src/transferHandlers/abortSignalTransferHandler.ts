import type { TransferHandler } from 'comlink'

export const abortSignalTransferHandler: TransferHandler<AbortSignal, MessagePort> = {
  canHandle: (obj): obj is AbortSignal => obj instanceof AbortSignal,
  serialize: (signal: AbortSignal) => {
    const { port1, port2 } = new MessageChannel()
    signal.addEventListener('abort', () => port1.postMessage('abort'))
    return [port2, [port2]]
  },
  deserialize: (port: MessagePort) => {
    const controller = new AbortController()

    port.start()
    port.addEventListener('message', () => {
      controller.abort()
    })
    return controller.signal
  },
}
