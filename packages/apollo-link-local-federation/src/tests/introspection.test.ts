import { gql } from '@apollo/client/core'
import { createLocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import { getIntrospectionQuery } from 'graphql'

import { createLocalFederationLink } from '../LocalFederationLink'
import { observablePromise } from '../utils'

import { createOperation } from './createOperation'

describe('Introspection', () => {
  it('resolves introspection query across services', async () => {
    const typeDefsA = gql`
      type Entity @key(fields: "id") {
        id: ID!
        propA: String
      }

      type Query {
        entity: Entity
      }
    `

    const typeDefsB = gql`
      extend type Entity @key(fields: "id") {
        propB: String
      }
    `

    const query = gql(getIntrospectionQuery())
    const link = createLocalFederationLink({
      services: [
        {
          name: 'A',
          link: createLocalSchemaLink({ typeDefs: typeDefsA, resolvers: {} }),
        },
        {
          name: 'B',
          link: createLocalSchemaLink({ typeDefs: typeDefsB, resolvers: {} }),
        },
      ],
    })

    const result = await observablePromise(link.request(createOperation(query)))

    expect(result!.errors).toBeUndefined()

    const entityType = result!.data!.__schema.types.find((type: any) => type.name === 'Entity')
    expect(entityType).toBeDefined()
    const fields = entityType.fields.map((field: any) => field.name)
    expect(fields).toEqual(['id', 'propA', 'propB'])
  })
})
