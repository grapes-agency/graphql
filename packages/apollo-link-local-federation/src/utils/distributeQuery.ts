import { gql } from '@apollo/client/core'
import {
  isObjectTypeExtension,
  isObjectTypeDefinition,
  isInterfaceTypeDefinition,
  unwrapType,
} from '@grapes-agency/tiny-graphql-runtime'
import {
  DocumentNode,
  DefinitionNode,
  FragmentDefinitionNode,
  visit,
  OperationDefinitionNode,
  ObjectTypeExtensionNode,
  ObjectTypeDefinitionNode,
  FieldNode,
  StringValueNode,
  specifiedScalarTypes,
  GraphQLError,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
} from 'graphql'

import { ExternalQuery } from './ExternalQuery'
import { LocalFederationService } from './LocalFederationService'
import { UsedFragmentsSet } from './UsedFragmentsSet'
import { mergeSelectionSets } from './mergeSelectionSets'

export interface DocumentInfo {
  service: LocalFederationService
  document: DocumentNode
  extension: boolean
  typename?: string
  keyDocument?: DocumentNode
  fieldDefinition?: FieldDefinitionNode
}

const getEntityKeys = (type: ObjectTypeDefinitionNode | ObjectTypeExtensionNode | InterfaceTypeDefinitionNode) =>
  type.directives
    ?.filter(directive => directive.name.value === 'key')
    .map(directive => (directive.arguments![0].value as StringValueNode).value) || []

const isEntity = (type: ObjectTypeExtensionNode | ObjectTypeDefinitionNode) =>
  Boolean(type.directives?.find(directive => directive.name.value === 'key'))

const findService = (
  typeName: string,
  fieldName: string,
  services: Array<LocalFederationService>
): null | { service: LocalFederationService; type: ObjectTypeExtensionNode | ObjectTypeDefinitionNode | string } => {
  for (const service of services) {
    const parentType = service.getType(typeName)

    if (!parentType || (!isObjectTypeExtension(parentType) && !isObjectTypeDefinition(parentType)) || !isEntity(parentType)) {
      continue
    }

    const field = parentType.fields?.find(f => f.name.value === fieldName)
    if (!field) {
      continue
    }

    const unwrappedType = unwrapType(field.type)
    const type = service.getType(unwrappedType)
    if (!type) {
      if (specifiedScalarTypes.find(s => s.name === unwrappedType.name.value)) {
        return { service, type: unwrappedType.name.value }
      }
      console.warn(`Unknown type ${unwrappedType.name.value} in service ${service.name}`)
      return null
    }

    if (!isObjectTypeDefinition(type) && !isObjectTypeExtension(type)) {
      console.warn(`Wrong type reference of ${unwrappedType.name} in service ${service.name}`)
      return null
    }

    return { service, type }
  }

  return null
}

interface ServiceHint {
  service: LocalFederationService
  typeName: string
  fieldName: string
  externalType: boolean
  parentFieldDefinition: FieldDefinitionNode
  keys: Array<string>
  path: Array<string>
}

interface ExtendedFieldNode extends FieldNode {
  serviceHint?: ServiceHint
}

export const distributeQuery = (
  query: DocumentNode,
  service: LocalFederationService,
  services: Array<LocalFederationService>
): [null | Map<string, DocumentInfo>, Array<GraphQLError>] => {
  const fieldPath: Array<{
    type: DefinitionNode | string
    originalType?: DefinitionNode | string
    name: string
    service: LocalFederationService
    fieldDefinition?: FieldDefinitionNode
  }> = []
  const injectFields: Array<Set<string>> = []
  const fragmentHints = new Map<string, typeof fieldPath>()
  const fragments = new Map<string, FragmentDefinitionNode>()
  const errors: Array<GraphQLError> = []
  const firstPass: DocumentNode = visit(query, {
    OperationDefinition: {
      enter: operationDefinition => {
        const typeName = operationDefinition.operation[0].toUpperCase() + operationDefinition.operation.substr(1)
        const type = service.getType(typeName)
        if (!type) {
          return null
        }
        fieldPath.push({ type, name: operationDefinition.operation, service })
      },
      leave: operationDefinition => {
        fieldPath.pop()
        if (!operationDefinition.selectionSet || operationDefinition.selectionSet.selections.length === 0) {
          return null
        }
      },
    },
    SelectionSet: {
      enter: () => {
        injectFields.push(new Set())
      },
      leave: baseSelectionSet => {
        const fields = injectFields.pop()!
        const inject = Array.from(fields)

        if (inject.length === 0) {
          if (baseSelectionSet.selections.length === 0) {
            return null
          }

          return
        }

        const { selectionSet } = gql(`{${Array.from(inject).join(' ')}}`).definitions[0] as OperationDefinitionNode

        return mergeSelectionSets(baseSelectionSet, selectionSet)
      },
    },
    FragmentSpread: fragmentSpread => {
      fragmentHints.set(fragmentSpread.name.value, [...fieldPath])
    },
    InlineFragment: {
      enter: inlinefragment => {
        const parent = fieldPath[fieldPath.length - 1]
        parent.originalType = parent.type
        parent.type = parent.service.getType(inlinefragment.typeCondition?.name.value ?? '')!
      },
      leave: () => {
        const parent = fieldPath[fieldPath.length - 1]
        parent.type = parent.originalType!
        parent.originalType = undefined
      },
    },
    FragmentDefinition: {
      enter: fragmentDefinition => {
        const name = fragmentDefinition.name.value
        if (!fragmentHints.has(name)) {
          return null
        }
        const hint = fragmentHints.get(name)!
        fieldPath.push(...hint)
      },
      leave: fragmentDefinition => {
        const name = fragmentDefinition.name.value
        fragments.set(name, fragmentDefinition)
        const hint = fragmentHints.get(name)!
        hint.forEach(() => fieldPath.pop())
      },
    },
    Field: {
      enter: (field: ExtendedFieldNode) => {
        const fieldName = field.name.value
        const aliasName = field.alias?.value || fieldName

        if (fieldName === '__typename') {
          return field
        }

        if ((fieldName === '__schema' || fieldName === '__type') && service.name !== 'IntrospectionService') {
          return null
        }

        const parent = fieldPath[fieldPath.length - 1]

        if (
          typeof parent.type === 'string' ||
          (!isObjectTypeDefinition(parent.type) && !isObjectTypeExtension(parent.type) && !isInterfaceTypeDefinition(parent.type))
        ) {
          errors.push(new GraphQLError('Subselection on non object type field is impossible'))
          return null
        }

        const parentField = parent.type.fields?.find(f => f.name.value === fieldName)
        const typeName = parent.type.name.value

        if (!parentField) {
          const entityKeys = getEntityKeys(parent.type)
          if (entityKeys.length === 0) {
            if (fieldPath.length > 1) {
              errors.push(new GraphQLError(`Cannot query field ${fieldName} on type ${typeName}`))
            }
            return null
          }

          const external = findService(typeName, fieldName, services)

          if (!external) {
            errors.push(new GraphQLError(`unable to resolve field "${fieldName}" of type "${typeName}"`))
            return null
          }

          field.serviceHint = {
            service: external.service,
            path: fieldPath.map(f => f.name),
            keys: entityKeys,
            typeName,
            fieldName,
            externalType: isObjectTypeExtension(parent.type),
            parentFieldDefinition: parent.fieldDefinition!,
          }

          fieldPath.push({ name: aliasName, ...external })

          const inject = injectFields[injectFields.length - 1]
          entityKeys.forEach(key => inject.add(key))

          return field
        }

        const type = parent.service.getType(parentField.type)
        if (type) {
          fieldPath.push({ type, name: aliasName, service: parent.service, fieldDefinition: parentField })
          return field
        }

        const parentFieldTypeName = unwrapType(parentField.type).name.value
        const scalarType = specifiedScalarTypes.find(s => s.name === parentFieldTypeName)
        if (scalarType) {
          fieldPath.push({ type: parentFieldTypeName, name: aliasName, service: parent.service })
          return field
        }

        errors.push(new GraphQLError(`Could not determine type for field ${field.name.value}`))
        return null
      },
      leave: field => {
        if (field.name.value !== '__typename') {
          fieldPath.pop()
        }
      },
    },
  })

  if (firstPass.definitions.length === 0) {
    return [null, errors]
  }

  const documents = new Map<string, DocumentInfo>()

  const processDocument = (
    path: string,
    currentService: LocalFederationService,
    document: DocumentNode,
    typename?: string,
    keyDocument?: DocumentNode,
    extension = false,
    fieldDefinition?: FieldDefinitionNode
  ) => {
    const externals = new Map<string, Map<LocalFederationService, Map<string, ExternalQuery>>>()

    const preProcessedDocument: DocumentNode = visit(document, {
      Field(field: ExtendedFieldNode) {
        if (!field.serviceHint) {
          return
        }

        const {
          service: externalService,
          typeName,
          path: mergePath,
          keys,
          externalType,
          parentFieldDefinition,
        } = field.serviceHint
        const joinedPath = mergePath.slice(1).join('.')
        if (!externals.has(joinedPath)) {
          externals.set(joinedPath, new Map())
        }

        const externalServiceMap = externals.get(joinedPath)!
        if (!externalServiceMap.has(externalService)) {
          externalServiceMap.set(externalService, new Map())
        }

        const externalTypeMap = externalServiceMap.get(externalService)!
        if (!externalTypeMap.has(typeName)) {
          externalTypeMap.set(typeName, new ExternalQuery(typeName, externalType, parentFieldDefinition))
        }

        delete field.serviceHint
        const externalQuery = externalTypeMap.get(typeName)!
        externalQuery.addField(field)
        externalQuery.addKeys(keys)

        return null
      },
    })

    const usedFragments = new UsedFragmentsSet(preProcessedDocument)

    const processedDocument: DocumentNode = visit(preProcessedDocument, {
      FragmentDefinition(fragmentDefinition) {
        const name = fragmentDefinition.name.value
        if (usedFragments.has(name)) {
          usedFragments.delete(name)
          return
        }
        return null
      },
    })

    const definitions = [
      ...processedDocument.definitions,
      ...Array.from(usedFragments, missingFragment => fragments.get(missingFragment)!),
    ]

    Object.assign(processedDocument, { definitions })

    documents.set(path, {
      service: currentService,
      document: processedDocument,
      extension,
      typename,
      keyDocument,
      fieldDefinition,
    })

    for (const [mergePath, serviceMap] of externals) {
      for (const [externalService, externalTypeMap] of serviceMap) {
        for (const [externalTypename, externalQuery] of externalTypeMap) {
          processDocument(
            mergePath,
            externalService,
            externalQuery.query,
            externalTypename,
            externalQuery.keyQuery,
            !externalQuery.externalType,
            externalQuery.fieldDefinition
          )
        }
      }
    }
  }

  processDocument('', service, firstPass)
  return [documents, errors]
}
