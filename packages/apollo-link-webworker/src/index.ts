import { debug } from './utils'

export * from './ApolloWebWorkerLink'
export * from './createApolloWorker'
export * from './registerTransferHandler'
export type { TransferHandler } from 'comlink'

export const setDebug = (mode: boolean) => debug(mode)
