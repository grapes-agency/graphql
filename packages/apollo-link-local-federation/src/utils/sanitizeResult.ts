import { isOperationDefinition, isFragmentDefinition } from '@grapes-agency/tiny-graphql-runtime/helpers'
import type { DocumentNode, SelectionSetNode } from 'graphql'

export const sanitizeResults = (data: any, document: DocumentNode) => {
  const fragments = new Map(
    document.definitions
      .filter(isFragmentDefinition)
      .map(fragmentDefinition => [fragmentDefinition.name.value, fragmentDefinition])
  )

  const processSelectionSet = (selectionSet: SelectionSetNode, currentData: any) => {
    if (currentData === null || currentData === undefined) {
      return null
    }

    const processedData: Record<string, any> = {}

    selectionSet.selections.forEach(selection => {
      switch (selection.kind) {
        case 'InlineFragment': {
          Object.assign(processedData, processSelectionSet(selection.selectionSet, currentData))
          break
        }
        case 'FragmentSpread': {
          const fragment = fragments.get(selection.name.value)
          if (fragment) {
            Object.assign(processedData, processSelectionSet(fragment.selectionSet, currentData))
          }
          break
        }
        case 'Field': {
          const selectionName = selection.alias?.value || selection.name.value
          const selectionData = currentData[selectionName] ?? null

          if (selection.selectionSet) {
            if (Array.isArray(selectionData)) {
              processedData[selectionName] = selectionData.map((d: any) => processSelectionSet(selection.selectionSet!, d))
            } else {
              processedData[selectionName] = processSelectionSet(selection.selectionSet, selectionData)
            }
          } else {
            processedData[selectionName] = selectionData
          }
          break
        }
      }
    })

    return processedData
  }

  return document.definitions.filter(isOperationDefinition).reduce<Record<string, any>>(
    (sanitizedData, definition) => ({
      ...sanitizedData,
      ...processSelectionSet(definition.selectionSet, data),
    }),
    {}
  )
}
