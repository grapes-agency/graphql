import type { SelectionSetNode, FieldNode } from 'graphql'

export const mergeSelectionSets = (selectionSetA: SelectionSetNode, selectionSetB: SelectionSetNode): SelectionSetNode => {
  const selections = [...selectionSetA.selections]

  for (const selection of selectionSetB.selections) {
    if (selection.kind !== 'Field') {
      continue
    }

    const name = selection.name.value
    const previousIndex = selections.findIndex(s => s.kind === 'Field' && s.name.value === name)
    if (previousIndex === -1) {
      selections.push(selection)
      continue
    }

    if (!selection.selectionSet) {
      continue
    }

    const previousSelection = selections[previousIndex] as FieldNode
    selections[previousIndex] = {
      ...previousSelection,
      selectionSet: mergeSelectionSets(previousSelection.selectionSet!, selection.selectionSet),
    }
  }

  return {
    ...selectionSetA,
    selections,
  }
}
