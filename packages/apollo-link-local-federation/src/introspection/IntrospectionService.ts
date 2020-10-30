import { createLocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import { ResolveInfo } from '@grapes-agency/tiny-graphql-runtime'
import { DocumentNode, IntrospectionQuery, IntrospectionType } from 'graphql'

import { LocalFederationService, observablePromise } from '../utils'

import { ensureNames } from './ensureNames'
import { mergeSchemas, mergeTypes } from './mergers'
import typeDefs from './typeDefs.graphql'

export class IntrospectionService extends LocalFederationService {
  private services: Array<LocalFederationService>

  constructor(services: Array<LocalFederationService>) {
    super({
      name: 'IntrospectionService',
      link: createLocalSchemaLink({
        typeDefs,
        resolvers: {
          Query: {
            __schema: async (_root, _args, _context, info) => {
              const schemas = (await this.forward<IntrospectionQuery>(info)).map(r => r.__schema)
              return mergeSchemas(schemas)
            },
            __type: async (_root, _args, _context, info) => {
              let resolvedType: IntrospectionType | null = null
              for (const result of await this.forward<{ __type: IntrospectionType }>(info)) {
                if (result.__type) {
                  resolvedType = resolvedType ? mergeTypes(resolvedType, result.__type) : result.__type
                }
              }

              return resolvedType
            },
          },
        },
        introspection: false,
      }),
    })
    this.services = [...services]
  }

  private async forward<T>({ selection, fragments }: ResolveInfo) {
    const query: DocumentNode = {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          selectionSet: {
            kind: 'SelectionSet',
            selections: [ensureNames(selection)],
          },
        },
        ...Object.values(fragments),
      ],
    }
    return (
      await Promise.all(
        this.services.map(service => observablePromise(service.execute({ query })).then(result => result?.data || null))
      )
    ).filter(Boolean) as Array<T>
  }
}
