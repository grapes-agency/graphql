import type { DocumentNode, InlineFragmentNode } from 'graphql'
import { visit } from 'graphql'

export const normalizeQuery = (query: DocumentNode) => {
  const fragments = new Map<string, InlineFragmentNode>()
  visit(query, {
    FragmentDefinition: fragmentDefinition => {
      fragments.set(fragmentDefinition.name.value, {
        kind: 'InlineFragment',
        selectionSet: fragmentDefinition.selectionSet,
        typeCondition: fragmentDefinition.typeCondition,
      })
    },
  })

  return visit(query, {
    FragmentDefinition: () => null,
    FragmentSpread: fragmentSpread => {
      const fragment = fragments.get(fragmentSpread.name.value)
      if (!fragment) {
        throw new Error(`Unknown fragment ${fragmentSpread.name.value}`)
      }

      return fragment
    },
  })
}
