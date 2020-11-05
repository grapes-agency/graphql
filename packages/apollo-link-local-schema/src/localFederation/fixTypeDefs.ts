import { DocumentNode, DefinitionNode } from 'graphql'

export const fixTypeDefs = (typeDefs: DocumentNode): DocumentNode => {
  const definitions: Array<DefinitionNode> = []
  for (const definition of typeDefs.definitions) {
    if (definition.kind === 'ObjectTypeExtension') {
      switch (definition.name.value) {
        case 'Query':
        case 'Mutation':
        case 'Subscription': {
          definitions.push({
            ...definition,
            kind: 'ObjectTypeDefinition',
          })
          continue
        }
      }
    }

    definitions.push({ ...definition })
  }

  return {
    ...typeDefs,
    definitions,
  }
}
