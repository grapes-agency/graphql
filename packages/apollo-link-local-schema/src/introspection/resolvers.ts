import type { Resolvers } from '@grapes-agency/tiny-graphql-runtime'
import {
  isObjectTypeDefinition,
  isSchemaDefinition,
  isObjectTypeExtension,
  isDirectiveDefinition,
  isInterfaceTypeDefinition,
  isUnionTypeDefinition,
  isEnumTypeDefinition,
  isInputObjectTypeDefinition,
  isNonNullType,
  isListType,
} from '@grapes-agency/tiny-graphql-runtime/helpers'
import {
  DocumentNode,
  ASTNode,
  DirectiveDefinitionNode,
  ScalarTypeDefinitionNode,
  ObjectTypeExtensionNode,
  TypeDefinitionNode,
  specifiedScalarTypes,
  FieldDefinitionNode,
  InputValueDefinitionNode,
  GraphQLError,
  EnumValueDefinitionNode,
  ObjectTypeDefinitionNode,
} from 'graphql'

import { isDeprecated, getDeprecationReason } from './deprecation'

const isTypeDefinition = (node: ASTNode): node is TypeDefinitionNode =>
  [
    'ScalarTypeDefinition',
    'ObjectTypeDefinition',
    'InterfaceTypeDefinition',
    'UnionTypeDefinition',
    'EnumTypeDefinition',
    'InputObjectTypeDefinition',
  ].includes(node.kind)

const specifiedScalarTypeDefinitions: Array<ScalarTypeDefinitionNode> = specifiedScalarTypes.map(specifiedScalarType => ({
  kind: 'ScalarTypeDefinition',
  name: {
    kind: 'Name',
    value: specifiedScalarType.name,
  },
  ...(specifiedScalarType.description
    ? {
        description: {
          kind: 'StringValue',
          value: specifiedScalarType.description,
        },
      }
    : {}),
}))

interface Options {
  federated?: boolean
}

export const createIntrospectionResolvers = (typeDefs: DocumentNode, { federated = false }: Options = {}): Resolvers => {
  const schemaDefinition = typeDefs.definitions.find(isSchemaDefinition)

  const typesMap = new Map(
    [
      ...specifiedScalarTypeDefinitions,
      ...(typeDefs.definitions.filter(type => isTypeDefinition(type) || (federated && isObjectTypeExtension(type))) as Array<
        TypeDefinitionNode | ObjectTypeExtensionNode
      >),
    ].map(definition => [definition.name.value, definition])
  )

  return {
    Query: {
      __schema: () => ({}),
      __type: (_root, { name }) => typesMap.get(name),
    },
    __Schema: {
      description: () => schemaDefinition?.description?.value || null,
      queryType: () => {
        const queryTypeName =
          schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'query')?.type.name.value || 'Query'

        if (typesMap.has(queryTypeName)) {
          return typesMap.get(queryTypeName)
        }

        if (!federated) {
          return null
        }

        const fakeQueryType: ObjectTypeDefinitionNode = {
          kind: 'ObjectTypeDefinition',
          name: { kind: 'Name', value: 'Query' },
        }

        return fakeQueryType
      },
      mutationType: () => {
        const mutationTypeName =
          schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'mutation')?.type.name.value ||
          'Mutation'
        return typesMap.get(mutationTypeName)
      },
      subscriptionType: () => {
        const subscriptionTypeName =
          schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'subscription')?.type.name.value ||
          'Subscripion'
        return typesMap.get(subscriptionTypeName)
      },
      directives: () => typeDefs.definitions.filter(isDirectiveDefinition),
      types: () => Array.from(typesMap.values()),
    },

    __Type: {
      name: (node: ASTNode) => ('name' in node ? node.name?.value : null),

      kind: (node: ASTNode) => {
        switch (node.kind) {
          case 'ScalarTypeDefinition': {
            return 'SCALAR'
          }
          case 'ObjectTypeDefinition':
          case 'ObjectTypeExtension': {
            return 'OBJECT'
          }
          case 'InterfaceTypeDefinition': {
            return 'INTERFACE'
          }
          case 'UnionTypeDefinition': {
            return 'UNION'
          }
          case 'EnumTypeDefinition': {
            return 'ENUM'
          }
          case 'InputObjectTypeDefinition': {
            return 'INPUT_OBJECT'
          }
          case 'NonNullType': {
            return 'NON_NULL'
          }
          case 'ListType': {
            return 'LIST'
          }
          default: {
            throw new GraphQLError(`Unknown kind ${node.kind}`)
          }
        }
      },
      description: (node: ASTNode) => ('description' in node ? node.description?.value : null),
      fields: (node: ASTNode, { includeDeprecated }) => {
        if (!(isObjectTypeDefinition(node) || isObjectTypeExtension(node) || isInterfaceTypeDefinition(node))) {
          return null
        }

        return node.fields?.filter(field => includeDeprecated || !isDeprecated(field))
      },
      interfaces: (node: ASTNode) => {
        if (!(isObjectTypeDefinition(node) || isObjectTypeExtension(node) || isInterfaceTypeDefinition(node))) {
          return null
        }

        return node.interfaces
      },
      possibleTypes: (node: ASTNode) => {
        if (!isUnionTypeDefinition(node)) {
          return null
        }

        return node.types?.map(possibleType => typesMap.get(possibleType.name.value))
      },
      enumValues: (node: ASTNode, { includeDeprecated }) => {
        if (!isEnumTypeDefinition(node)) {
          return null
        }

        return node.values?.find(value => includeDeprecated || !isDeprecated(value))
      },
      inputFields: (node: ASTNode) => {
        if (!isInputObjectTypeDefinition(node)) {
          return null
        }

        return node.fields
      },
      ofType: (node: ASTNode) => {
        if (!(isListType(node) || isNonNullType(node))) {
          return null
        }

        return node.type.kind === 'NamedType' ? typesMap.get(node.type.name.value) : node.type
      },
    },

    __Field: {
      name: (node: FieldDefinitionNode) => node.name.value,
      description: (node: FieldDefinitionNode) => node.description?.value,
      args: (node: FieldDefinitionNode) => node.arguments,
      type: (node: FieldDefinitionNode) => (node.type.kind === 'NamedType' ? typesMap.get(node.type.name.value) : node.type),
      isDeprecated: (node: FieldDefinitionNode) => isDeprecated(node),
      deprecationReason: (node: FieldDefinitionNode) => getDeprecationReason(node),
    },

    __InputValue: {
      name: (node: InputValueDefinitionNode) => node.name.value,
      description: (node: InputValueDefinitionNode) => node.description?.value,
      type: (node: InputValueDefinitionNode) => (node.type.kind === 'NamedType' ? typesMap.get(node.type.name.value) : node.type),
      defaultValue: (node: InputValueDefinitionNode) =>
        node.defaultValue && 'value' in node.defaultValue ? String(node.defaultValue.value) : null,
    },

    __EnumValue: {
      name: (node: EnumValueDefinitionNode) => node.name.value,
      description: (node: EnumValueDefinitionNode) => node.description?.value,
      isDeprecated: (node: EnumValueDefinitionNode) => isDeprecated(node),
      deprecationReason: (node: EnumValueDefinitionNode) => getDeprecationReason(node),
    },

    __Directive: {
      name: (node: DirectiveDefinitionNode) => node.name.value,
      description: (node: DirectiveDefinitionNode) => node.description?.value,
      locations: (node: DirectiveDefinitionNode) => node.locations.map(location => location.value),
      args: (node: DirectiveDefinitionNode) => node.arguments,
      isRepeatable: (node: DirectiveDefinitionNode) => node.repeatable,
    },
  }
}
