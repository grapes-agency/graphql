import type { Resolvers as BaseResolvers, ResolveInfo } from '@grapes-agency/tiny-graphql-runtime'
import type { DocumentNode } from 'graphql'

export type DocumentsPair = readonly [DocumentNode | null, DocumentNode | null]

export type ReferenceResolver<Context = any> = (reference: any, context: Context, info: ResolveInfo) => any

export type Resolvers<Context = any> = Record<
  string,
  BaseResolvers<Context>[string] & { __resolveReference?: ReferenceResolver<Context> }
>
