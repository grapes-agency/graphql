import type { SelectionSetNode, FieldNode } from 'graphql'
import { visit } from 'graphql'

export const ensureNames = (baseField: FieldNode): FieldNode => {
  let hasName = false
  let inSchema = false
  return visit(baseField, {
    SelectionSet: {
      enter() {
        hasName = false
      },
      leave(selectionSet) {
        if (hasName || inSchema) {
          return
        }

        const extendedSelectionSet: SelectionSetNode = {
          ...selectionSet,
          selections: [
            ...selectionSet.selections,
            {
              kind: 'Field',
              name: { kind: 'Name', value: 'name' },
            },
          ],
        }

        return extendedSelectionSet
      },
    },
    Field: {
      enter({ name: { value } }) {
        if (value === '__schema') {
          inSchema = true
        }

        if (value === 'name') {
          hasName = true
        }
      },
      leave({ name: { value } }) {
        if (value === '__schema') {
          inSchema = false
        }
      },
    },
  })
}
