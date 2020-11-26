/* eslint-disable no-await-in-loop */
import {
  ValueNode,
  GraphQLError,
  InputValueDefinitionNode,
  ArgumentNode,
  TypeNode,
  EnumTypeDefinitionNode,
  GraphQLScalarType,
  InputObjectTypeDefinitionNode,
} from 'graphql'

import { GraphQLCompountError } from './GraphQLCompountError'
import type { InputObjectTypeDefinitionNodeWithResolver, InputValueDefinitionNodeWithResolver } from './interfaces'

type Path = Array<string | number>

interface GenerateArgsOptions {
  parentName: string
  inputMap: Map<string, InputObjectTypeDefinitionNodeWithResolver>
  enumMap: Map<string, EnumTypeDefinitionNode>
  scalarMap: Map<string, GraphQLScalarType | null>
  specifiedArgs?: Record<string, any>
  argDefinitions?: ReadonlyArray<InputValueDefinitionNode>
  args?: ReadonlyArray<ArgumentNode>
}

export const generateArgs = ({
  parentName,
  inputMap,
  enumMap,
  scalarMap,
  specifiedArgs = {},
  argDefinitions = [],
  args = [],
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

  const mapValue = (
    value: any,
    path: Path,
    inputValue: InputValueDefinitionNodeWithResolver,
    inputObjectType: InputObjectTypeDefinitionNode | null,
    arg: ArgumentNode | null,
    type: TypeNode,
    resolve: boolean
  ): any => {
    if (resolve && inputValue.resolve) {
      try {
        value = inputValue.resolve(value, { field: inputValue, parentType: inputObjectType, arg })
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

      return value.map((v, index) => mapValue(v, [...path, index], inputValue, inputObjectType, arg, type.type, true))
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
      const enumValue = enumMap.get(typeName)!.values?.find(v => v.name.value === value)
      if (enumValue) {
        return enumValue.name.value
      }

      errors.push(getInputMappingError(`Cannot use ${value} as enum ${typeName} for argument ${path.join('.')}`, path))
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

        combinedFields[fieldName] = mapValue(
          value[fieldName] ?? null,
          [...path, fieldName],
          field,
          inputType,
          arg,
          field.type,
          true
        )
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

    const mappedValue = mapValue(
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
