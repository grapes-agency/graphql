import type { ObjectTypeDefinitionNode, FieldDefinitionNode, GraphQLScalarType, FragmentDefinitionNode, FieldNode } from 'graphql'

export interface SubscriptionResolver<Context = any, T = any> {
  resolve?: (...args: Parameters<FieldResolver<Context>>) => T | Promise<T>
  subscribe: (...args: Parameters<FieldResolver<Context>>) => AsyncIterator<T> | Promise<AsyncIterator<T>>
}

export interface ResolveInfo {
  readonly parentType: ObjectTypeDefinitionNode
  readonly field: FieldDefinitionNode
  readonly fragments: { [key: string]: FragmentDefinitionNode }
  readonly selection: FieldNode
}

export type FieldResolver<Context = any> = (rootValue: any, args: any, context: Context, info: ResolveInfo) => any

export type Resolver<Context = any> = FieldResolver<Context> | SubscriptionResolver<Context>

export interface OperationNames {
  query: string
  mutation: string
  subscription: string
}

export type TypeResolver<Context = any> = (
  rootValue: any,
  context: Context,
  info: ResolveInfo
) => string | Promise<string> | null | Promise<null>

export type Resolvers<Context = any> = Record<
  string,
  { __resolveType?: TypeResolver } & Record<string, Resolver<Context> | GraphQLScalarType>
>
