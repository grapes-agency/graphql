import * as Comlink from 'comlink'

import { abortSignalTransferHandler } from './abortSignalTransferHandler'
import { apolloErrorHandler } from './apolloErrorHandler'
import { genericErrorHandler } from './genericErrorHandler'
import { graphQLErrorHandler } from './graphQLErrorHandler'
import { observableTransferHandler } from './observableTransferHandler'
import { operationTransferHandler } from './operationTransferHandler'

export const registerTransferHandlers = () => {
  Comlink.transferHandlers.set('OPERATION', operationTransferHandler)
  Comlink.transferHandlers.set('OBSERVABLE', observableTransferHandler)
  Comlink.transferHandlers.set('ABORT_SIGNAL', abortSignalTransferHandler)
  Comlink.transferHandlers.set('GRAPHQL_ERROR', graphQLErrorHandler)
  Comlink.transferHandlers.set('APOLLO_ERROR', apolloErrorHandler)
  Comlink.transferHandlers.set('ERROR', genericErrorHandler)
}
