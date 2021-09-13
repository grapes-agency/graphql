import type { TransferHandler } from 'comlink'
import * as Comlink from 'comlink'

export const registerTransferHandler = <T, S>(name: string, tranferHandler: TransferHandler<T, S>) =>
  Comlink.transferHandlers.set(name, tranferHandler)
