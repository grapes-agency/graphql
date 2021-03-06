import type {
  ObjectTypeDefinitionNode,
  FieldDefinitionNode,
  GraphQLScalarType,
  FragmentDefinitionNode,
  FieldNode,
  ObjectTypeExtensionNode,
  InputValueDefinitionNode,
  InputObjectTypeDefinitionNode,
  ArgumentNode,
} from 'graphql'

export interface SubscriptionResolver<Context = any, T = any> {
  resolve?: (...args: Parameters<FieldResolver<Context>>) => T | Promise<T>
  subscribe: (...args: Parameters<FieldResolver<Context>>) => AsyncIterator<T> | Promise<AsyncIterator<T>>
}

export interface ResolveInfo {
  readonly parentType: ObjectTypeDefinitionNode | ObjectTypeExtensionNode
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
  GraphQLScalarType | ({ __resolveType?: TypeResolver } & Record<string, Resolver<Context>>)
>

export interface FieldDefinitionNodeWithResolver extends FieldDefinitionNode {
  resolve: Resolver
}

export interface InputResolveInfo {
  parentType: InputObjectTypeDefinitionNode | null
  field: InputValueDefinitionNode
  arg: ArgumentNode | null
}

export type InputResolver = (root: any, info: InputResolveInfo) => any

export interface InputValueDefinitionNodeWithResolver extends InputValueDefinitionNode {
  resolve?: InputResolver
}

export interface InputObjectTypeDefinitionNodeWithResolver extends Omit<InputObjectTypeDefinitionNode, 'fields'> {
  fields: ReadonlyArray<InputValueDefinitionNodeWithResolver>
  resolve?: InputResolver
}
