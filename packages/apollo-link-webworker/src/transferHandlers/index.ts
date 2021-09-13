import * as Comlink from 'comlink'

import { abortSignalTransferHandler } from './abortSignalTransferHandler'
import { observableTransferHandler } from './observableTransferHandler'
import { operationTransferHandler } from './operationTransferHandler'

export const registerTransferHandlers = () => {
  Comlink.transferHandlers.set('OPERATION', operationTransferHandler)
  Comlink.transferHandlers.set('OBSERVABLE', observableTransferHandler)
  Comlink.transferHandlers.set('ABORT_SIGNAL', abortSignalTransferHandler)
}
