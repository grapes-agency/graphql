import { DocumentNode } from 'graphql'

export const fixTypeDefs = (serviceName: string, typeDefs: DocumentNode) => {
  for (const definition of typeDefs.definitions) {
    if (definition.kind === 'ObjectTypeDefinition') {
      switch (definition.name.value) {
        case 'Query': {
          throw new Error(`Federated links cannot define type Query in service "${serviceName}", only extend it`)
        }
        case 'Mutation': {
          throw new Error(`Federated links cannot define type Mutation in service "${serviceName}", only extend it`)
        }
        case 'Subscription': {
          throw new Error(`Federated links cannot define type Subscription in service "${serviceName}", only extend it`)
        }
      }
    }

    if (definition.kind === 'ObjectTypeExtension') {
      switch (definition.name.value) {
        case 'Query':
        case 'Mutation':
        case 'Subscription': {
          Object.assign(definition, {
            kind: 'ObjectTypeDefinition',
          })
        }
      }
    }
  }
}
