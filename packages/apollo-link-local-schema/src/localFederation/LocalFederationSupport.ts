import { isObjectTypeDefinition } from '@grapes-agency/tiny-graphql-runtime/helpers'
import { DocumentNode, GraphQLError } from 'graphql'
import merge from 'lodash/merge'

import { Resolvers } from '../interfaces'
import { mergeDocuments } from '../utils'

import { fixTypeDefs } from './fixTypeDefs'
import baseFederationTypeDefs from './typeDefs.graphql'

export class LocalFederationSupport {
  typeDefs!: DocumentNode

  constructor(public name: string) {
    //
  }

  public patch(typeDefs: DocumentNode, resolvers: Resolvers): [DocumentNode, Resolvers] {
    fixTypeDefs(this.name, typeDefs)
    this.typeDefs = typeDefs

    const types = typeDefs.definitions.filter(isObjectTypeDefinition)

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

    const federationResolvers: Resolvers = {
      Query: {
        __resolveType: (_root, { typename, reference }) => {
          const referenceResolver = resolvers[typename]?.__resolveReference

          if (!referenceResolver) {
            throw new GraphQLError(`Missing ${typename}.__resolveRefernece`)
          }

          return { __typename: typename, ...referenceResolver(reference) }
        },
        __extendType: (_root, { typename, parent }) => ({ ...parent, __typename: typename }),
      },
      __ResolvableTypes: {
        __resolveType: data => data?.__typename,
      },
    }
    return [mergeDocuments([typeDefs, federationTypeDefs]), merge(resolvers, federationResolvers)]
  }

  public getType(name: string) {
    return this.typeDefs.definitions.find(definition => 'name' in definition && definition.name?.value === name)
  }
}
