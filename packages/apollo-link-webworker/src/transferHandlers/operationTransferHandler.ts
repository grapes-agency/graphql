import type { Operation } from '@apollo/client'
import { createOperation } from '@apollo/client/link/utils'
import type * as Comlink from 'comlink'

import type { SerializedField } from '../utils'
import { deserializeObject, serializeObject } from '../utils'

const operationStorage = new Map<string, Operation>()

interface TransferableOperation extends Omit<Operation, 'setContext' | 'getContext'> {
  context: SerializedField
}

export const operationTransferHandler: Comlink.TransferHandler<Operation, TransferableOperation> = {
  canHandle: (obj): obj is Operation => typeof obj === 'object' && obj !== null && 'operationName' in obj,
  serialize: operation => {
    if (operation.operationName) {
      operationStorage.set(operation.operationName, operation)
    }
    const { setContext, getContext, ...rest } = operation
    const [serializedContext, transferables] = serializeObject(operation.getContext())
    const transferableOperation = { ...rest, context: serializedContext }
    return [transferableOperation, transferables]
  },
  deserialize: ({ context, ...transferableOperation }) => {
    if (transferableOperation.operationName && operationStorage.has(transferableOperation.operationName)) {
      const operation = operationStorage.get(transferableOperation.operationName)!
      operationStorage.delete(transferableOperation.operationName)

      return createOperation(operation.getContext(), transferableOperation)
    }

    return createOperation(deserializeObject(context), transferableOperation)
  },
}
