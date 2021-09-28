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
  readonly resolveContext: Record<string, any>
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

export interface InputFieldResolveInfo {
  parentType: InputObjectTypeDefinitionNode | null
  field: InputValueDefinitionNode
  arg: ArgumentNode | null
}

export interface InputObjectResolveInfo {
  type: InputObjectTypeDefinitionNode
  arg: ArgumentNode | null
}

export type InputFieldResolver<Context = any> = (root: any, context: Context, info: InputFieldResolveInfo) => any
export type InputObjectResolver<Context = any> = (root: any, context: Context, info: InputObjectResolveInfo) => any

export interface InputValueDefinitionNodeWithResolver<Context = any> extends InputValueDefinitionNode {
  resolve?: InputFieldResolver<Context>
}

export interface InputObjectTypeDefinitionNodeWithResolver<Context = any> extends Omit<InputObjectTypeDefinitionNode, 'fields'> {
  fields: ReadonlyArray<InputValueDefinitionNodeWithResolver>
  resolve?: InputObjectResolver<Context>
}
