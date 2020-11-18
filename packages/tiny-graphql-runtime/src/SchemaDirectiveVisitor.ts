import type { FieldDefinitionNodeWithResolver } from './interfaces'

export interface SchemaDirectiveVisitor {
  visitFieldDefinition?: (field: FieldDefinitionNodeWithResolver, args: Record<string, any>) => void
}
