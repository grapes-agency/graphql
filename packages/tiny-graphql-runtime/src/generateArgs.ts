import {
  ValueNode,
  GraphQLError,
  InputValueDefinitionNode,
  ArgumentNode,
  TypeNode,
  InputObjectTypeDefinitionNode,
  EnumTypeDefinitionNode,
  GraphQLScalarType,
} from 'graphql'

interface GenerateArgsOptions {
  inputMap: Map<string, InputObjectTypeDefinitionNode>
  enumMap: Map<string, EnumTypeDefinitionNode>
  scalarMap: Map<string, GraphQLScalarType | null>
  specifiedArgs: Record<string, any>
  argDefinitions?: ReadonlyArray<InputValueDefinitionNode>
  args?: ReadonlyArray<ArgumentNode>
}

export const generateArgs = ({
  inputMap,
  enumMap,
  scalarMap,
  specifiedArgs,
  argDefinitions = [],
  args = [],
}: GenerateArgsOptions) => {
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

  const mapValue = (value: any, name: string, type: TypeNode): any => {
    if (type.kind === 'NonNullType') {
      if (value === null) {
        throw new GraphQLError(`Cannot use null for non-nullable argument ${name}`)
      }

      return mapValue(value, name, type.type)
    }

    if (value === null) {
      return null
    }

    if (type.kind === 'ListType') {
      if (!Array.isArray(value)) {
        throw new GraphQLError(`Cannot use non-array for list argument ${name}`)
      }

      return value.map(v => mapValue(v, name, type.type))
    }

    const typeName = type.name.value

    if (scalarMap.has(typeName)) {
      return scalarMap.get(typeName)!.serialize(value)
    }

    if (enumMap.has(typeName)) {
      const enumValue = enumMap.get(typeName)!.values?.find(v => v.name.value === value)
      if (enumValue) {
        return enumValue.name.value
      }

      throw new GraphQLError(`Cannot use ${value} as enum ${typeName} for argument ${name}`)
    }

    if (inputMap.has(typeName)) {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        throw new GraphQLError(`Cannot use non-object for list argument ${name}`)
      }

      const inputType = inputMap.get(typeName)!

      return (
        inputType.fields?.reduce((combinedFields, field) => {
          const fieldName = field.name.value

          return {
            ...combinedFields,
            [fieldName]: mapValue(value[fieldName] ?? null, `${name}.${field.name.value}`, field.type),
          }
        }, {}) ?? null
      )
    }

    throw new GraphQLError(`Unknown type ${typeName} for list argument ${name}`)
  }

  return argDefinitions.reduce((combinedArgs, inputValue) => {
    const name = inputValue.name.value
    const fieldArgument = args.find(a => a.name.value === name)

    const value = fieldArgument
      ? getValue(fieldArgument.value)
      : inputValue.defaultValue
      ? getValue(inputValue.defaultValue)
      : null

    const mappedValue = mapValue(value, name, inputValue.type)

    if (mappedValue === undefined) {
      return combinedArgs
    }

    return {
      ...combinedArgs,
      [name]: value,
    }
  }, {})
}
