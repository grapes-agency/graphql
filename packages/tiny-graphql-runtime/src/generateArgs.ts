import {
  ValueNode,
  NullValueNode,
  VariableNode,
  ListValueNode,
  ObjectValueNode,
  GraphQLError,
  InputValueDefinitionNode,
  ArgumentNode,
} from 'graphql'

const isNullValue = (node: ValueNode): node is NullValueNode => node.kind === 'NullValue'
const isVariableValue = (node: ValueNode): node is VariableNode => node.kind === 'Variable'
const isListValue = (node: ValueNode): node is ListValueNode => node.kind === 'ListValue'
const isObjectValue = (node: ValueNode): node is ObjectValueNode => node.kind === 'ObjectValue'

export const generateArgs = (
  argDefinitions: ReadonlyArray<InputValueDefinitionNode> = [],
  args: ReadonlyArray<ArgumentNode> = [],
  specifiedArgs: Record<string, any>
) => {
  const getValue = (valueNode: ValueNode): any => {
    if (isNullValue(valueNode)) {
      return null
    }

    if (isListValue(valueNode)) {
      return valueNode.values.map(getValue)
    }

    if (isObjectValue(valueNode)) {
      return valueNode.fields.reduce((combinedField, f) => {
        const value = getValue(f.value)
        if (value === undefined) {
          return combinedField
        }

        return {
          ...combinedField,
          [f.name.value]: value,
        }
      }, {})
    }
    if (isVariableValue(valueNode)) {
      return specifiedArgs[valueNode.name.value]
    }

    return valueNode.value
  }

  return argDefinitions.reduce((combinedArgs, inputValue) => {
    const name = inputValue.name.value
    const fieldArgument = args.find(a => a.name.value === name)

    const value = fieldArgument
      ? getValue(fieldArgument.value)
      : inputValue.defaultValue
      ? getValue(inputValue.defaultValue)
      : null

    if (value === null && inputValue.type.kind === 'NonNullType') {
      throw new GraphQLError(`Cannot use null for non-nullable argument ${name}`)
    }

    if (value === undefined) {
      return combinedArgs
    }

    return {
      ...combinedArgs,
      [name]: value,
    }
  }, {})
}
