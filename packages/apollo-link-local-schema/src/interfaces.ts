import type { Resolvers as BaseResolvers } from '@grapes-agency/tiny-graphql-runtime'
import type { DocumentNode } from 'graphql'

export type DocumentsPair = readonly [DocumentNode | null, DocumentNode | null]

export type ReferenceResolver = (reference: any) => any

export type Resolvers<Context = any> = Record<string, BaseResolvers<Context>[string] & { __resolveReference?: ReferenceResolver }>
