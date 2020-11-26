import { DocumentNode, FieldNode, GraphQLError } from 'graphql'

type Writable<T> = { -readonly [P in keyof T]: Writable<T[P]> }
type WritableFieldNode = Writable<FieldNode>
export const parseDocument = (template: string): DocumentNode => {
  const openSubSelections = (template.match(/\{/g) || []).length
  const closeSubSelections = (template.match(/}/g) || []).length

  if (openSubSelections !== closeSubSelections) {
    throw new GraphQLError(`Cannot parse document ${template}`)
  }

  const extractSelections = (selectionTemplate: string): Array<WritableFieldNode> => {
    const subSelections: Array<string> = []

    const templateParts = selectionTemplate
      .replace(/\{(.+)\}/g, (_match, subSelection) => {
        if (subSelection.length === 0) {
          return ''
        }
        subSelections.push(subSelection)
        return `$sub_${subSelections.length - 1}`
      })
      .trim()
      .split(/ +/g)

    const selections: Array<Writable<FieldNode>> = []

    for (const templatePart of templateParts) {
      const subSelectionMatches = templatePart.match(/^\$sub_(\d+)$/)
      if (subSelectionMatches) {
        const field = selections[selections.length - 1]
        field.selectionSet = {
          kind: 'SelectionSet',
          selections: extractSelections(subSelections[Number(subSelectionMatches[1])]),
        }

        continue
      }
      selections.push({
        kind: 'Field',
        name: { kind: 'Name', value: templatePart },
      })
    }

    return selections
  }

  return {
    kind: 'Document',
    definitions: [
      {
        kind: 'OperationDefinition',
        operation: 'query',
        selectionSet: {
          kind: 'SelectionSet',
          selections: extractSelections(template) as Array<FieldNode>,
        },
      },
    ],
  }
}
