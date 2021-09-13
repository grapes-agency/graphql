import * as Comlink from 'comlink'

import { debug } from './debug'
import { isPlainObject } from './isPlainObject'

export type SerializedField =
  | {
      type: 'RAW'
      value: any
    }
  | { type: 'ARRAY'; value: Array<SerializedField> }
  | { type: 'OBJECT'; value: Record<string, SerializedField> }
  | { type: 'HANDLER'; name: string; value: any }

export const serializeObject = (object: any): [SerializedField, Array<Transferable>] => {
  if (Array.isArray(object)) {
    const serializedObject: SerializedField = {
      type: 'ARRAY',
      value: [],
    }
    const transferables: Array<Transferable> = []
    object.forEach(element => {
      const [serializedValue, additionalTransferables] = serializeObject(element)
      serializedObject.value.push(serializedValue)
      transferables.push(...additionalTransferables)
    })
    return [serializedObject, transferables]
  }
  if (isPlainObject(object)) {
    const serializedObject: Record<string, SerializedField> = {}
    const transferables: Array<Transferable> = []

    for (const [key, value] of Object.entries(object)) {
      const [serializedValue, additionalTransferables] = serializeObject(value)
      serializedObject[key] = serializedValue
      transferables.push(...additionalTransferables)
    }

    return [
      {
        type: 'OBJECT',
        value: serializedObject,
      },
      transferables,
    ]
  }

  if (typeof object !== 'object' && typeof object !== 'function') {
    return [
      {
        type: 'RAW',
        value: object,
      },
      [],
    ]
  }

  for (const [name, handler] of Comlink.transferHandlers) {
    if (handler.canHandle(object)) {
      const [serializedValue, transferables] = handler.serialize(object)
      return [
        {
          type: 'HANDLER',
          name,
          value: serializedValue,
        },
        transferables,
      ]
    }
  }

  if (debug()) {
    console.warn('Cannot serialize object', object)
  }

  return [{ type: 'RAW', value: null }, []]
}

export const deserializeObject = (serializedObject: SerializedField): any => {
  if (serializedObject.type === 'RAW') {
    return serializedObject.value
  }

  if (serializedObject.type === 'ARRAY') {
    return serializedObject.value.map(deserializeObject)
  }

  if (serializedObject.type === 'HANDLER') {
    const handler = Comlink.transferHandlers.get(serializedObject.name)
    return handler!.deserialize(serializedObject.value)
  }

  const deserializedObject: Record<string, any> = {}
  for (const [key, value] of Object.entries(serializedObject.value)) {
    deserializedObject[key] = deserializeObject(value)
  }

  return deserializedObject
}
