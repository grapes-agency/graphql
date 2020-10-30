import { SelectionSetNode, FieldNode, visit } from 'graphql'

export const ensureNames = (baseField: FieldNode): FieldNode => {
  let hasName = false
  return visit(baseField, {
    SelectionSet: {
      enter() {
        hasName = false
      },
      leave(selectionSet) {
        if (hasName) {
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
    Field(field) {
      if (field.name.value === 'name') {
        hasName = true
      }
    },
  })
}
