import type {
  FieldDefinitionNodeWithResolver,
  InputObjectTypeDefinitionNodeWithResolver,
  InputValueDefinitionNodeWithResolver,
} from './interfaces'

export interface SchemaDirectiveVisitor {
  visitFieldDefinition?: (field: FieldDefinitionNodeWithResolver, args: Record<string, any>) => void
  visitInputObjectDefinition?: (type: InputObjectTypeDefinitionNodeWithResolver, args: Record<string, any>) => void
  visitInputValueDefinition?: (field: InputValueDefinitionNodeWithResolver, args: Record<string, any>) => void
}
