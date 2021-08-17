import { gql } from '@apollo/client/core'
import { createLocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import type { Resolvers } from '@grapes-agency/tiny-graphql-runtime'
import type { StringValueNode } from 'graphql'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils'

import { createOperation } from './createOperation'

describe('Directive', () => {
  it('passes directives to services', async () => {
    const typeDefs = gql`
      directive @test(prop: String!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

      type TestA {
        propA: String
        propB: String
      }

      extend type Query {
        testA: TestA
      }
    `

    const resolvers: Resolvers = {
      Query: {
        testA: () => ({}),
      },
      TestA: {
        propA: (_root, _args, _context, { selection }) => {
          expect(selection.directives!.length).toEqual(1)
          const [directive] = selection.directives!
          return `PropA.${(directive.arguments![0].value as StringValueNode).value}`
        },
        propB: () => {
          throw new Error('should not have been called')
        },
      },
    }

    const link = createLocalFederationLink({
      services: [
        {
          name: 'simple',
          link: createLocalSchemaLink({ typeDefs, resolvers }),
        },
      ],
    })

    const query = gql`
      query {
        testA {
          propA @test(prop: "X")
          propB @skip(if: true)
        }
      }
    `

    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()
    expect(result!.data).toEqual({
      testA: {
        propA: 'PropA.X',
      },
    })
  })
})
