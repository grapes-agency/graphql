/* eslint-disable default-case */
import { DocumentNode, visit, ObjectTypeDefinitionNode, Visitor, ASTKindToNode, FieldNode } from 'graphql'

import { DocumentsPair } from '../interfaces'

const alwaysAllowFields = ['__schema', '__type', '__resolveType', '__typename']

export const splitDocument = (document: DocumentNode, objectType?: ObjectTypeDefinitionNode): DocumentsPair => {
  if (!objectType) {
    return [null, document]
  }

  const hasField = (field: FieldNode) =>
    alwaysAllowFields.includes(field.name.value) || Boolean(objectType.fields?.find(f => f.name.value === field.name.value))

  const usedFragments = new Set<string>()
  let inFragment = false
  let hasOperationDefinition = false
  const baseVisitor: Visitor<ASTKindToNode> = {
    OperationDefinition: {
      leave(operationDefinition) {
        if (operationDefinition.selectionSet.selections.length === 0) {
          return null
        }
        hasOperationDefinition = true
      },
    },
    FragmentSpread(fragmentSpread) {
      usedFragments.add(fragmentSpread.name.value)
    },
    FragmentDefinition: {
      enter() {
        inFragment = true
      },
      leave(fragmentDefinition) {
        inFragment = false
        if (!usedFragments.has(fragmentDefinition.name.value)) {
          return null
        }
      },
    },
  }

  let fieldDepth = -1
  hasOperationDefinition = false
  const internalDocument: DocumentNode = visit(document, {
    ...baseVisitor,
    Field: {
      enter(field) {
        if (inFragment) {
          return
        }

        fieldDepth += 1
        if (fieldDepth > 0) {
          return
        }

        if (hasField(field)) {
          return
        }

        fieldDepth -= 1
        return null
      },
      leave() {
        fieldDepth -= 1
      },
    },
  })
  const hasInteralOperationDefinition = hasOperationDefinition
  hasOperationDefinition = false
  usedFragments.clear()
  const externalDocument: DocumentNode = visit(document, {
    ...baseVisitor,
    Field: {
      enter(field) {
        if (inFragment) {
          return
        }
        fieldDepth += 1
        if (fieldDepth > 0) {
          return
        }

        if (!hasField(field)) {
          return
        }

        fieldDepth -= 1
        return null
      },
      leave() {
        fieldDepth -= 1
      },
    },
  })

  const hasExternalOperationDefinition = hasOperationDefinition

  return [
    internalDocument && hasInteralOperationDefinition && internalDocument.definitions.length > 0 ? internalDocument : null,
    externalDocument && hasExternalOperationDefinition && externalDocument.definitions.length > 0 ? externalDocument : null,
  ]
}
