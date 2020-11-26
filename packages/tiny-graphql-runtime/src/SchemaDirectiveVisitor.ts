import type { FieldDefinitionNodeWithResolver, InputValueDefinitionNodeWithResolver } from './interfaces'

export interface SchemaDirectiveVisitor {
  visitFieldDefinition?: (field: FieldDefinitionNodeWithResolver, args: Record<string, any>) => void
  visitInputValueDefinition?: (field: InputValueDefinitionNodeWithResolver, args: Record<string, any>) => void
}
