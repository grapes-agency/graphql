import { FieldNode, DocumentNode, SelectionSetNode, OperationDefinitionNode } from 'graphql'

import { mergeSelectionSets } from './mergeSelectionSets'
import { parseDocument } from './parseDocument'

export class ExternalQuery {
  protected fields = new Set<FieldNode>()
  protected keys = new Set<string>()
  constructor(private typeName: string, public externalType: boolean) {
    //
  }

  addField(field: FieldNode) {
    this.fields.add(field)
  }

  addKeys(keys: Array<string>) {
    keys.forEach(key => this.keys.add(key))
  }

  get keyQuery(): DocumentNode {
    const keyDocuments: Array<DocumentNode> = Array.from(this.keys).map(key => parseDocument(key))

    const selectionSet = keyDocuments.reduce<SelectionSetNode>(
      (set, keyDocument) => mergeSelectionSets(set, (keyDocument.definitions[0] as OperationDefinitionNode).selectionSet),
      {
        kind: 'SelectionSet',
        selections: [],
      }
    )

    return {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          selectionSet,
        },
      ],
    }
  }

  get query(): DocumentNode {
    if (this.externalType) {
      return this.buildResolveTypeQuery()
    }
    return this.buildExtendTypeQuery()
  }

  private buildResolveTypeQuery(): DocumentNode {
    return {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              {
                kind: 'Field',
                name: {
                  kind: 'Name',
                  value: '__resolveType',
                },
                arguments: [
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'typename' },
                    value: {
                      kind: 'Variable',
                      name: { kind: 'Name', value: 'typename' },
                    },
                  },
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'reference' },
                    value: {
                      kind: 'Variable',
                      name: { kind: 'Name', value: 'operationData' },
                    },
                  },
                ],
                selectionSet: {
                  kind: 'SelectionSet',
                  selections: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: this.typeName } },
                      selectionSet: {
                        kind: 'SelectionSet',
                        selections: Array.from(this.fields),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    }
  }

  private buildExtendTypeQuery(): DocumentNode {
    return {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              {
                kind: 'Field',
                name: {
                  kind: 'Name',
                  value: '__extendType',
                },
                arguments: [
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'typename' },
                    value: {
                      kind: 'Variable',
                      name: { kind: 'Name', value: 'typename' },
                    },
                  },
                  {
                    kind: 'Argument',
                    name: { kind: 'Name', value: 'parent' },
                    value: {
                      kind: 'Variable',
                      name: { kind: 'Name', value: 'operationData' },
                    },
                  },
                ],
                selectionSet: {
                  kind: 'SelectionSet',
                  selections: [
                    {
                      kind: 'InlineFragment',
                      typeCondition: { kind: 'NamedType', name: { kind: 'Name', value: this.typeName } },
                      selectionSet: {
                        kind: 'SelectionSet',
                        selections: Array.from(this.fields),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    }
  }
}
