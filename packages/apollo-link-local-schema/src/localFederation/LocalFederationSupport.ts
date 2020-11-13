import type { Resolver } from '@grapes-agency/tiny-graphql-runtime'
import { isObjectTypeDefinition, isObjectTypeExtension } from '@grapes-agency/tiny-graphql-runtime/helpers'
import { DocumentNode, GraphQLError, ObjectTypeDefinitionNode, ObjectTypeExtensionNode } from 'graphql'
import merge from 'lodash/merge'

import type { Resolvers } from '../interfaces'
import { mergeDocuments } from '../utils'

import { fixTypeDefs } from './fixTypeDefs'
import baseFederationTypeDefs from './typeDefs.graphql'

export class LocalFederationSupport {
  typeDefs!: DocumentNode

  constructor(public name: string) {
    //
  }

  public patch(typeDefs: DocumentNode, resolvers: Resolvers): [DocumentNode, Resolvers] {
    const fixedTypeDefs = fixTypeDefs(typeDefs)
    this.typeDefs = fixedTypeDefs

    const types = fixedTypeDefs.definitions.filter(
      definition => isObjectTypeDefinition(definition) || isObjectTypeExtension(definition)
    ) as Array<ObjectTypeDefinitionNode | ObjectTypeExtensionNode>

    const federationTypeDefs: DocumentNode = {
      kind: 'Document',
      definitions: [
        {
          kind: 'UnionTypeDefinition',
          name: { kind: 'Name', value: '__ResolvableTypes' },
          types: types.map(type => ({ kind: 'NamedType', name: { kind: 'Name', value: type.name.value } })),
        },
        ...baseFederationTypeDefs.definitions,
      ],
    }

    const federationResolvers: Record<string, Record<string, Resolver>> = {
      Query: {
        __resolveType: async (_root, { typename, reference }, context, info) => {
          const referenceResolver = resolvers[typename]?.__resolveReference

          if (!referenceResolver) {
            throw new GraphQLError(`Missing ${typename}.__resolveReference`)
          }

          const resolvedReference = await referenceResolver(reference, context, info)
          if (resolvedReference) {
            return { __typename: typename, ...resolvedReference }
          }
          return null
        },
        __extendType: (_root, { typename, parent }) => ({ ...parent, __typename: typename }),
      },
      __ResolvableTypes: {
        __resolveType: data => data?.__typename,
      },
    }
    return [mergeDocuments([fixedTypeDefs, federationTypeDefs]), merge(resolvers, federationResolvers)]
  }

  public getType(name: string) {
    return this.typeDefs.definitions.find(definition => 'name' in definition && definition.name?.value === name)
  }
}
