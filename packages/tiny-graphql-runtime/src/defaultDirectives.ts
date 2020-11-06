import type { DirectiveDefinitionNode } from 'graphql'

const skip: DirectiveDefinitionNode = {
  kind: 'DirectiveDefinition',
  name: { kind: 'Name', value: 'skip' },
  locations: [
    {
      kind: 'Name',
      value: 'FIELD',
    },
    {
      kind: 'Name',
      value: 'FRAGMENT_SPREAD',
    },
    {
      kind: 'Name',
      value: 'INLINE_FRAGMENT',
    },
  ],
  repeatable: false,
  arguments: [
    {
      kind: 'InputValueDefinition',
      name: {
        kind: 'Name',
        value: 'if',
      },
      type: {
        kind: 'NonNullType',
        type: {
          kind: 'NamedType',
          name: {
            kind: 'Name',
            value: 'Boolean',
          },
        },
      },
    },
  ],
}

const include: DirectiveDefinitionNode = {
  ...skip,
  name: {
    ...skip.name,
    value: 'include',
  },
}

export const defaultDirectives: Array<DirectiveDefinitionNode> = [skip, include]
