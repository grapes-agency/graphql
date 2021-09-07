import type { Operation } from '@apollo/client'
import { createOperation } from '@apollo/client/link/utils'
import * as Comlink from 'comlink'

const operationStorage = new Map<string, Operation>()

const operationTransferHandler: Comlink.TransferHandler<Operation, Omit<Operation, 'setContext' | 'getContext'>> = {
  canHandle: (obj): obj is Operation => typeof obj === 'object' && obj !== null && 'operationName' in obj,
  serialize: operation => {
    if (operation.operationName) {
      operationStorage.set(operation.operationName, operation)
    }
    const { setContext, getContext, ...transferableOperation } = operation

    return [transferableOperation, []]
  },
  deserialize: transferableOperation => {
    if (transferableOperation.operationName && operationStorage.has(transferableOperation.operationName)) {
      const operation = operationStorage.get(transferableOperation.operationName)!
      operationStorage.delete(transferableOperation.operationName)

      return createOperation(operation.getContext(), transferableOperation)
    }

    return createOperation({}, transferableOperation)
  },
}

export const setupRemoteOperation = () => {
  Comlink.transferHandlers.set('OPERATION', operationTransferHandler)
}
