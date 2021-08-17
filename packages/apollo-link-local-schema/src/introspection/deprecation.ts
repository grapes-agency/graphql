import type { FieldDefinitionNode, EnumValueDefinitionNode, StringValueNode } from 'graphql'

const getDeprecateDirective = (node: FieldDefinitionNode | EnumValueDefinitionNode) =>
  node.directives?.find(directive => directive.name.value === 'deprecated')

export const isDeprecated = (node: FieldDefinitionNode | EnumValueDefinitionNode) => Boolean(getDeprecateDirective(node))
export const getDeprecationReason = (node: FieldDefinitionNode | EnumValueDefinitionNode) => {
  const directive = getDeprecateDirective(node)
  if (!directive) {
    return null
  }

  const reasonArg = directive.arguments?.find(arg => arg.name.value === 'reason')
  if (!reasonArg) {
    return null
  }

  return (reasonArg.value as StringValueNode).value
}
