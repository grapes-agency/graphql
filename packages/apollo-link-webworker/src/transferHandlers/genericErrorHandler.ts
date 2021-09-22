import type { TransferHandler } from 'comlink'

export type TransferableGenericError = [string, string, string | undefined]

export const genericErrorHandler: TransferHandler<Error, TransferableGenericError> = {
  canHandle: (obj): obj is Error => obj instanceof Error,
  serialize: (error: Error) => [[error.name, error.message, error.stack], []],
  deserialize: ([name, message, stack]) => {
    const error = new Error()
    error.name = name
    error.stack = stack
    error.message = message

    return error
  },
}
