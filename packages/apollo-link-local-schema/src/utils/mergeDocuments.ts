import {
  DocumentNode,
  ObjectTypeExtensionNode,
  ObjectTypeDefinitionNode,
  DefinitionNode,
  visit,
  FieldDefinitionNode,
  ASTNode,
} from 'graphql'

const isObjectTypeDefinition = (node: ASTNode): node is ObjectTypeDefinitionNode => node.kind === 'ObjectTypeDefinition'
const isObjectTypeExtension = (node: ASTNode): node is ObjectTypeExtensionNode => node.kind === 'ObjectTypeExtension'

export const mergeDocuments = (documents: Array<DocumentNode>): DocumentNode => {
  const types = new Map<string, Array<ObjectTypeExtensionNode | ObjectTypeDefinitionNode>>()
  const documentDefinitions: Array<DefinitionNode> = []
  const ensureType = (type: string) => !types.has(type) && types.set(type, [])

  documents.forEach(document => {
    const modifiedDocument: DocumentNode = visit(document, {
      ObjectTypeExtension(objectTypeExtension) {
        const name = objectTypeExtension.name.value
        ensureType(name)
        types.get(name)!.push(objectTypeExtension)
        return null
      },
      ObjectTypeDefinition(objectTypeDefinition) {
        const name = objectTypeDefinition.name.value
        ensureType(name)
        types.get(name)!.push(objectTypeDefinition)
        return null
      },
    })

    documentDefinitions.push(...modifiedDocument.definitions)
  })

  types.forEach((nodes, name) => {
    const typeDefinitions = nodes.filter(isObjectTypeDefinition)
    const typeExtensions = nodes.filter(isObjectTypeExtension)

    if (typeDefinitions.length > 1) {
      throw new Error(`Multiple type definitions for type "${name}"`)
    }

    if (typeDefinitions.length === 0) {
      const [typeExtension, ...restTypeExtensions] = typeExtensions
      documentDefinitions.push({
        ...typeExtension,
        fields: restTypeExtensions.reduce<Array<FieldDefinitionNode>>(
          (fieldDefinitions, extension) => [...fieldDefinitions, ...extension.fields!],
          [...typeExtension.fields!]
        ),
      })
      return
    }

    const [definition] = typeDefinitions

    documentDefinitions.push({
      ...definition,
      fields: typeExtensions.reduce<Array<FieldDefinitionNode>>(
        (fieldDefinitions, extension) => [...fieldDefinitions, ...extension.fields!],
        [...definition.fields!]
      ),
    })
  })

  return {
    kind: 'Document',
    definitions: documentDefinitions,
  }
}
