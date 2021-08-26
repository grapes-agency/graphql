import { gql } from '@apollo/client/core'
import { print } from 'graphql'

import { parseDocument } from '../utils/parseDocument'

describe('parseDocument', () => {
  it('works similar to gql for simple selection', () => {
    expect(print(gql('{id}'))).toEqual(print(parseDocument('id')))
  })
  it('works similar to gql for sub selection', () => {
    expect(print(gql('{ parent { x, y }}'))).toEqual(print(parseDocument('parent {x, y}')))
  })
})
