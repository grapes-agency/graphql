import type {
  ASTNode,
  FragmentDefinitionNode,
  DirectiveDefinitionNode,
  OperationDefinitionNode,
  UnionTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  SchemaDefinitionNode,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  EnumTypeDefinitionNode,
  TypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  ObjectTypeExtensionNode,
  ListTypeNode,
  InputObjectTypeDefinitionNode,
  SelectionSetNode,
  SelectionNode,
  GraphQLResolveInfo,
} from 'graphql'

import type { Resolver, FieldResolver, ResolveInfo } from './interfaces'

export const isFragmentDefinition = (node: ASTNode): node is FragmentDefinitionNode => node.kind === 'FragmentDefinition'
export const isDirectiveDefinition = (node: ASTNode): node is DirectiveDefinitionNode => node.kind === 'DirectiveDefinition'
export const isOperationDefinition = (node: ASTNode): node is OperationDefinitionNode => node.kind === 'OperationDefinition'
export const isObjectTypeExtension = (node: ASTNode): node is ObjectTypeExtensionNode => node.kind === 'ObjectTypeExtension'
export const isInterfaceTypeDefinition = (node: ASTNode): node is InterfaceTypeDefinitionNode =>
  node.kind === 'InterfaceTypeDefinition'
export const isUnionTypeDefinition = (node: ASTNode): node is UnionTypeDefinitionNode => node.kind === 'UnionTypeDefinition'
export const isInterfaceDefinition = (node: ASTNode): node is InterfaceTypeDefinitionNode =>
  node.kind === 'InterfaceTypeDefinition'
export const isInputObjectTypeDefinition = (node: ASTNode): node is InputObjectTypeDefinitionNode =>
  node.kind === 'InputObjectTypeDefinition'
export const isSchemaDefinition = (node: ASTNode): node is SchemaDefinitionNode => node.kind === 'SchemaDefinition'
export const isObjectTypeDefinition = (node: ASTNode): node is ObjectTypeDefinitionNode => node.kind === 'ObjectTypeDefinition'
export const isScalarTypeDefinition = (node: ASTNode): node is ScalarTypeDefinitionNode => node.kind === 'ScalarTypeDefinition'
export const isEnumTypeDefinition = (node: ASTNode): node is EnumTypeDefinitionNode => node.kind === 'EnumTypeDefinition'
export const unwrapType = (node: TypeNode): NamedTypeNode => (node.kind === 'NamedType' ? node : unwrapType(node.type))
export const isNonNullType = (node: ASTNode): node is NonNullTypeNode => node.kind === 'NonNullType'
export const isListType = (node: ASTNode): node is ListTypeNode => node.kind === 'ListType'
export const isDeepListType = (node: ASTNode): node is ListTypeNode =>
  isNonNullType(node) ? isDeepListType(node.type) : isListType(node)

export const isFieldResolver = <T>(resolver: Resolver<T>): resolver is FieldResolver<T> => typeof resolver === 'function'

export const isCustomResolveInfo = (info: ResolveInfo | GraphQLResolveInfo): info is ResolveInfo =>
  Boolean((info as any).selection)

export const isSelectionSet = (selectionSet: any): selectionSet is SelectionSetNode =>
  'kind' in selectionSet && selectionSet.kind === 'SelectionSet'

export const getSelectedFieldNames = (
  selectionSetOrResolveInfo: SelectionSetNode | GraphQLResolveInfo | ResolveInfo,
  fragments: Record<string, FragmentDefinitionNode> = {}
): Array<string> => {
  let selections: ReadonlyArray<SelectionNode> = []
  if (isSelectionSet(selectionSetOrResolveInfo)) {
    selections = selectionSetOrResolveInfo.selections
  } else if (isCustomResolveInfo(selectionSetOrResolveInfo)) {
    if (selectionSetOrResolveInfo.selection.selectionSet) {
      fragments = selectionSetOrResolveInfo.fragments
      selections = selectionSetOrResolveInfo.selection.selectionSet.selections
    }
  }

  if (selections.length === 0) {
    return []
  }

  return selections.flatMap(selection => {
    switch (selection.kind) {
      case 'InlineFragment': {
        return getSelectedFieldNames(selection.selectionSet, fragments)
      }
      case 'FragmentSpread': {
        const fragment = fragments[selection.name.value]
        if (!fragment) {
          throw new Error(`Unknown fragment ${selection.name.value}`)
        }
        return getSelectedFieldNames(fragment.selectionSet, fragments)
      }
      default: {
        return selection.name.value
      }
    }
  })
}

export const selectedFieldsIsLimitedTo = (
  infoOrSelectionSet: SelectionSetNode | GraphQLResolveInfo | ResolveInfo,
  fieldNames: Array<string>
) => {
  const availableFields = [...fieldNames, '__typename']
  const selectedFields = getSelectedFieldNames(infoOrSelectionSet)
  return selectedFields.every(field => availableFields.includes(field))
}
