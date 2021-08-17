/* eslint-disable no-await-in-loop */
import type {
  ValueNode,
  InputValueDefinitionNode,
  ArgumentNode,
  TypeNode,
  GraphQLScalarType,
  InputObjectTypeDefinitionNode,
} from 'graphql'
import { GraphQLError } from 'graphql'

import { GraphQLCompountError } from './GraphQLCompountError'
import type { InputObjectTypeDefinitionNodeWithResolver, InputValueDefinitionNodeWithResolver } from './interfaces'

type Path = Array<string | number>

interface GenerateArgsOptions {
  parentName: string
  inputMap: Map<string, InputObjectTypeDefinitionNodeWithResolver>
  enumMap: Map<string, Array<string>>
  scalarMap: Map<string, GraphQLScalarType | null>
  specifiedArgs?: Record<string, any>
  argDefinitions?: ReadonlyArray<InputValueDefinitionNode>
  args?: ReadonlyArray<ArgumentNode>
  context?: any
}

export const generateArgs = async ({
  parentName,
  inputMap,
  enumMap,
  scalarMap,
  specifiedArgs = {},
  argDefinitions = [],
  args = [],
  context = null,
}: GenerateArgsOptions) => {
  const errors: Array<GraphQLError> = []
  const getInputMappingError = (message: string, path: Path, originalError?: GraphQLError) =>
    new GraphQLError(message, null, null, null, null, originalError, {
      ...(originalError?.extensions || {}),
      inputPath: [parentName, ...(originalError?.extensions?.inputPath || path)],
    })

  const getValue = (value: ValueNode): any => {
    switch (value.kind) {
      case 'NullValue': {
        return null
      }
      case 'ListValue': {
        return value.values.map(getValue)
      }
      case 'Variable': {
        return specifiedArgs[value.name.value]
      }
      case 'ObjectValue': {
        return value.fields.reduce((combinedFields, field) => {
          const fieldValue = getValue(field.value)
          if (fieldValue === undefined) {
            return combinedFields
          }
          return {
            ...combinedFields,
            [field.name.value]: fieldValue,
          }
        }, {})
      }
      default: {
        return value.value
      }
    }
  }

  const mapValue = async (
    value: any,
    path: Path,
    inputValue: InputValueDefinitionNodeWithResolver,
    inputObjectType: InputObjectTypeDefinitionNode | null,
    arg: ArgumentNode | null,
    type: TypeNode,
    resolve: boolean
  ): Promise<any> => {
    value = value === undefined ? null : value

    if (resolve && inputValue.resolve) {
      try {
        value = await inputValue.resolve(value, context, { field: inputValue, parentType: inputObjectType, arg })
      } catch (error) {
        if (error instanceof GraphQLCompountError) {
          errors.push(...error.errors.map(e => getInputMappingError(e.message, path, e)))
        } else {
          errors.push(getInputMappingError(error.message, path, error))
        }
        return null
      }
    }

    if (type.kind === 'NonNullType') {
      if (value === null) {
        errors.push(getInputMappingError(`Cannot use null for non-nullable argument ${path.join('.')}`, path))
        return null
      }

      return mapValue(value, path, inputValue, inputObjectType, arg, type.type, false)
    }

    if (value === null) {
      return null
    }

    if (type.kind === 'ListType') {
      if (!Array.isArray(value)) {
        errors.push(getInputMappingError(`Cannot use non-array for list argument ${path.join('.')}`, path))
        return null
      }

      return Promise.all(
        value.map((v, index) => mapValue(v, [...path, index], inputValue, inputObjectType, arg, type.type, true))
      )
    }

    const typeName = type.name.value

    if (typeName.startsWith('__')) {
      return value
    }

    if (scalarMap.has(typeName)) {
      try {
        return scalarMap.get(typeName)!.serialize(value)
      } catch (error) {
        errors.push(getInputMappingError(error.message, path, error))
        return null
      }
    }

    if (enumMap.has(typeName)) {
      const enumValue = enumMap.get(typeName)!.find(v => v === value)
      if (enumValue) {
        return enumValue
      }
      errors.push(getInputMappingError(`Enum "${typeName}" cannot represent value: "${value}"`, path))
      return null
    }

    if (inputMap.has(typeName)) {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        errors.push(getInputMappingError(`Cannot use non-object for list argument ${path.join('.')}`, path))
        return null
      }

      const inputType = inputMap.get(typeName)!
      if (!inputType.fields) {
        return null
      }

      const combinedFields: Record<string, any> = {}
      for (const field of inputType.fields) {
        const fieldName = field.name.value

        combinedFields[fieldName] = await mapValue(
          value[fieldName] ?? null,
          [...path, fieldName],
          field,
          inputType,
          arg,
          field.type,
          true
        )
      }

      if (inputType.resolve) {
        try {
          return inputType.resolve(combinedFields, context, { type: inputType, arg })
        } catch (error) {
          if (error instanceof GraphQLCompountError) {
            errors.push(...error.errors.map(e => getInputMappingError(e.message, path, e)))
          } else {
            errors.push(getInputMappingError(error.message, path, error))
          }
          return null
        }
      }
      return combinedFields
    }

    errors.push(getInputMappingError(`Unknown type ${typeName} for list argument ${path.join('.')}`, path))
    return null
  }

  const combinedArgs: Record<string, any> = {}

  for (const inputValue of argDefinitions) {
    const name = inputValue.name.value
    const fieldArgument = args.find(a => a.name.value === name) || null

    const value = fieldArgument
      ? getValue(fieldArgument.value)
      : inputValue.defaultValue
      ? getValue(inputValue.defaultValue)
      : null

    const mappedValue = await mapValue(
      value,
      [name],
      inputValue as InputValueDefinitionNodeWithResolver,
      null,
      fieldArgument,
      inputValue.type,
      true
    )

    if (mappedValue !== undefined) {
      combinedArgs[name] = mappedValue
    }
  }

  if (errors.length > 0) {
    throw new GraphQLCompountError(errors)
  }

  return combinedArgs
}
