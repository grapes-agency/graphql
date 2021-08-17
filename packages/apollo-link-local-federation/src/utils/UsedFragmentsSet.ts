import type { DocumentNode } from 'graphql'
import { visit } from 'graphql'

export class UsedFragmentsSet extends Set {
  constructor(document: DocumentNode) {
    super()

    visit(document, {
      FragmentSpread: fragmentSpread => {
        this.add(fragmentSpread.name.value)
      },
    })
  }
}
