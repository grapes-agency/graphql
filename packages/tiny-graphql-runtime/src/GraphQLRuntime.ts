/* eslint-disable no-await-in-loop */
import {
  DocumentNode,
  ObjectTypeDefinitionNode,
  specifiedScalarTypes,
  FieldDefinitionNode,
  ExecutionResult,
  GraphQLError,
  SelectionSetNode,
  GraphQLScalarType,
  DirectiveDefinitionNode,
  SelectionNode,
  EnumTypeDefinitionNode,
  ObjectTypeExtensionNode,
  isScalarType,
} from 'graphql'
import Observable from 'zen-observable'

import { PromiseRegistry } from './PromiseRegistry'
import { asyncIteratorToObservable } from './asyncIteratorToObservable'
import { defaultDirectives } from './defaultDirectives'
import { generateArgs } from './generateArgs'
import {
  isObjectTypeDefinition,
  isUnionTypeDefinition,
  isInterfaceDefinition,
  isEnumTypeDefinition,
  isDirectiveDefinition,
  isScalarTypeDefinition,
  isSchemaDefinition,
  isOperationDefinition,
  isFragmentDefinition,
  isDeepListType,
  isNonNullType,
  unwrapType,
  isObjectTypeExtension,
} from './helpers'
import type { Resolvers, Resolver, FieldResolver, SubscriptionResolver, ResolveInfo } from './interfaces'

const typenameFieldDefinition: FieldDefinitionNode = {
  kind: 'FieldDefinition',
  name: { kind: 'Name', value: '__typename' },
  type: {
    kind: 'NamedType',
    name: {
      kind: 'Name',
      value: 'String',
    },
  },
}

const SPREAD = '__spread'

const isSubscriptionResolver = (resolver: Resolver): resolver is SubscriptionResolver =>
  typeof resolver === 'object' && resolver !== null && 'subscribe' in resolver

type WithoutScalar<T = Resolvers[string]> = T extends GraphQLScalarType ? never : T

const asResolvers = (possibleResolvers?: Resolvers[string]): WithoutScalar => {
  if (!possibleResolvers || isScalarType(possibleResolvers)) {
    return {}
  }

  return possibleResolvers
}

const defaultResolver: Resolver = (root, _args, _context, { field }) => {
  if (!root || typeof root !== 'object') {
    return null
  }

  return root[field.name.value] ?? null
}

interface GraphQLRuntimeOptions {
  typeDefs: DocumentNode
  resolvers?: Resolvers
  defaultResolver?: Resolver
  allowObjectExtensionAsTypes?: boolean
}

interface ExecutionOptions {
  query: DocumentNode
  rootData?: any
  context?: any
  args?: {
    [key: string]: any
  }
}

export class GraphQLRuntime {
  private resolvers: Resolvers
  private objectMap: Map<string, ObjectTypeDefinitionNode | ObjectTypeExtensionNode>
  private unionMap: Map<string, Set<string>>
  private interfaceMap: Map<string, Set<string>>
  private scalarMap: Map<string, GraphQLScalarType | null>
  private enumMap: Map<string, EnumTypeDefinitionNode>
  private directiveMap: Map<string, DirectiveDefinitionNode>
  private defaultResolver: Resolver

  public queryType: ObjectTypeDefinitionNode | null
  public mutationType: ObjectTypeDefinitionNode | null
  public subscriptionType: ObjectTypeDefinitionNode | null

  constructor({
    typeDefs,
    resolvers = {},
    defaultResolver: dResolver = defaultResolver,
    allowObjectExtensionAsTypes = false,
  }: GraphQLRuntimeOptions) {
    this.defaultResolver = dResolver
    this.resolvers = resolvers

    const interfaceObjectMap = new Map<string, Set<string>>()

    const objects = typeDefs.definitions.filter(
      definition => isObjectTypeDefinition(definition) || (allowObjectExtensionAsTypes && isObjectTypeExtension(definition))
    ) as Array<ObjectTypeDefinitionNode | ObjectTypeExtensionNode>

    this.objectMap = new Map(
      objects.map(definition => {
        definition.interfaces?.forEach(iface => {
          const name = iface.name.value
          if (!interfaceObjectMap.has(name)) {
            interfaceObjectMap.set(name, new Set())
          }
          interfaceObjectMap.get(name)!.add(definition.name.value)
        })

        return [definition.name.value, definition]
      })
    )

    this.interfaceMap = new Map(
      typeDefs.definitions
        .filter(isInterfaceDefinition)
        .map(definition => [definition.name.value, interfaceObjectMap.get(definition.name.value) || new Set()])
    )

    this.unionMap = new Map(
      typeDefs.definitions
        .filter(isUnionTypeDefinition)
        .map(definition => [definition.name.value, new Set(definition.types?.map(type => type.name.value) || [])])
    )

    this.enumMap = new Map(
      typeDefs.definitions.filter(isEnumTypeDefinition).map(definition => [definition.name.value, definition])
    )

    this.directiveMap = new Map(
      [
        ...(typeDefs.definitions.filter(isDirectiveDefinition) as Array<DirectiveDefinitionNode>),
        ...defaultDirectives,
      ].map(definition => [definition.name.value, definition])
    )

    this.scalarMap = new Map([
      ...specifiedScalarTypes.map<[string, GraphQLScalarType]>(scalarType => [scalarType.name, scalarType]),
      ...typeDefs.definitions
        .filter(isScalarTypeDefinition)
        .map<[string, GraphQLScalarType | null]>(scalarDefinition => [
          scalarDefinition.name.value,
          ((resolvers[scalarDefinition.name.value] as unknown) as GraphQLScalarType) || null,
        ]),
    ])
    const schemaDefinition = typeDefs.definitions.find(isSchemaDefinition)
    const queryTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'query')?.type.name.value || 'Query'
    const possibleQueryType = this.objectMap.get(queryTypeName)
    this.queryType = possibleQueryType && possibleQueryType.kind === 'ObjectTypeDefinition' ? possibleQueryType : null

    const mutationTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'mutation')?.type.name.value ||
      'Mutation'
    const possibleMutationType = this.objectMap.get(mutationTypeName)
    this.mutationType = possibleMutationType && possibleMutationType.kind === 'ObjectTypeDefinition' ? possibleMutationType : null
    const subscriptionTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'subscription')?.type.name.value ||
      'Subscription'
    const possibleSubscriptionType = this.objectMap.get(subscriptionTypeName)
    this.subscriptionType =
      possibleSubscriptionType && possibleSubscriptionType.kind === 'ObjectTypeDefinition' ? possibleSubscriptionType : null
  }

  protected processDirectives(selection: SelectionNode, args: Record<string, any>) {
    return (selection.directives || []).reduce<Record<string, any>>((combinedDirectives, directive) => {
      const schemaDirective = this.directiveMap.get(directive.name.value)
      if (!schemaDirective) {
        return combinedDirectives
      }

      const locations = schemaDirective.locations.map(loc => loc.value)
      if (selection.kind === 'Field' && !locations.includes('FIELD')) {
        return combinedDirectives
      }

      if (selection.kind === 'FragmentSpread' && !locations.includes('FRAGMENT_SPREAD')) {
        return combinedDirectives
      }

      if (selection.kind === 'InlineFragment' && !locations.includes('INLINE_FRAGMENT')) {
        return combinedDirectives
      }

      return {
        ...combinedDirectives,
        [directive.name.value]: generateArgs(schemaDirective.arguments, directive.arguments, args),
      }
    }, {})
  }

  protected compose(data: Record<string, any>): Record<string, any> {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        data[key] = value.map(v => this.compose(v))
      }

      if (typeof value === 'object' && value !== null) {
        data[key] = this.compose(value)
      }

      if (key.startsWith(SPREAD)) {
        Object.assign(data, value)
        delete data[key]
      }
    }

    return data
  }

  public async execute({ rootData = null, query, context, args = {} }: ExecutionOptions): Promise<ExecutionResult> {
    const mainOperation = query.definitions.find(isOperationDefinition)
    if (!mainOperation) {
      return { errors: [new GraphQLError('Operation definition missing')] }
    }

    for (const variableDefinition of mainOperation.variableDefinitions || []) {
      if (
        variableDefinition.type.kind === 'NonNullType' &&
        !variableDefinition.defaultValue &&
        !(variableDefinition.variable.name.value in args)
      ) {
        return {
          errors: [new GraphQLError(`Missing variable ${variableDefinition.variable.name.value}`)],
        }
      }
    }

    const fragments = Object.fromEntries(
      query.definitions.filter(isFragmentDefinition).map(fragment => [fragment.name.value, fragment])
    )

    const mainType =
      mainOperation.operation === 'query'
        ? this.queryType
        : mainOperation.operation === 'mutation'
        ? this.mutationType
        : this.subscriptionType

    if (!mainType) {
      return { errors: [new GraphQLError(`No ${mainOperation.operation} type found`)] }
    }

    let expectSubscription = mainOperation.operation === 'subscription'
    let executeSequentially = mainOperation.operation === 'mutation'

    const errors: Array<GraphQLError> = []
    const promiseRegistry = new PromiseRegistry()
    let spreadIndex = 0

    const processSelectionSet = (
      selectionSet: SelectionSetNode,
      type: ObjectTypeDefinitionNode | ObjectTypeExtensionNode,
      parentData: any
    ) => {
      const data: Record<string, any> = {}
      let executionChain: Promise<any> = Promise.resolve()
      for (const selection of selectionSet.selections) {
        const directives = this.processDirectives(selection, args)

        if (directives.skip?.if === true) {
          break
        }

        if (directives.include?.if === false) {
          break
        }

        switch (selection.kind) {
          case 'Field': {
            const field =
              selection.name.value === '__typename'
                ? typenameFieldDefinition
                : type.fields?.find(f => f.name.value === selection.name.value)
            const fieldName = selection.alias?.value || selection.name.value

            if (!field) {
              data[fieldName] = null
              errors.push(new GraphQLError(`Cannot query field ${selection.name.value} on type ${type.name.value}`))
              break
            }

            const fieldType = unwrapType(field.type).name.value

            const resolveInfo: ResolveInfo = {
              field,
              parentType: type,
              fragments,
              selection,
            }

            const resolver = (field === typenameFieldDefinition
              ? () => type.name.value
              : asResolvers(this.resolvers[type.name.value])[field.name.value] || this.defaultResolver) as Resolver

            let generatedArgs = {}
            try {
              generatedArgs = generateArgs(field.arguments, selection.arguments, args)
            } catch (error) {
              data[fieldName] = null
              errors.push(error)
              break
            }

            if (expectSubscription) {
              expectSubscription = false

              const mapSubscriptionResult = (result: any) =>
                new Observable(observer => {
                  const processsedData = processSelectionSet(
                    selectionSet,
                    { ...type, name: { kind: 'Name', value: '__' } },
                    result
                  )

                  promiseRegistry.all().then(() => {
                    observer.next(this.compose(processsedData))
                  })
                })

              if (isSubscriptionResolver(resolver)) {
                data[fieldName] = asyncIteratorToObservable(resolver, parentData, args, context, resolveInfo).flatMap(
                  mapSubscriptionResult
                )
              } else {
                promiseRegistry.add(
                  Promise.resolve(resolver(parentData, generatedArgs, context, resolveInfo)).then(result => {
                    if (!isSubscriptionResolver(result)) {
                      data[fieldName] = null
                      errors.push(
                        new GraphQLError(`Subscription field ${field.name.value} has to return an object with subscribe function`)
                      )
                      return
                    }
                    data[fieldName] = asyncIteratorToObservable(result, parentData, args, context, resolveInfo).flatMap(
                      mapSubscriptionResult
                    )
                  })
                )
              }
              break
            }
            let resultPromise: Promise<any>
            if (executeSequentially) {
              executionChain = executionChain.then(() =>
                Promise.resolve((resolver as FieldResolver)(parentData, generatedArgs, context, resolveInfo))
              )
              resultPromise = executionChain
            } else {
              resultPromise = Promise.resolve((resolver as FieldResolver)(parentData, generatedArgs, context, resolveInfo))
            }

            promiseRegistry.add(
              resultPromise
                .catch(error => {
                  errors.push(new GraphQLError(error.message, null, null, null, null, error))
                  return null
                })
                .then(result => {
                  result = result === undefined ? null : result

                  if (field.type.kind === 'NonNullType' && result === null) {
                    throw new GraphQLError(`Cannot return null for non-nullable field ${type.name.value}.${field.name.value}`)
                  }

                  const isListSelection = isDeepListType(field.type)
                  if (isListSelection && !Array.isArray(result)) {
                    if (isNonNullType(field.type)) {
                      throw new GraphQLError(`${type.name.value}.${field.name.value} has to return an array`)
                    }
                    data[fieldName] = null
                    return
                  }

                  if (this.scalarMap.has(fieldType)) {
                    const scalarType = this.scalarMap.get(fieldType)
                    if (isListSelection) {
                      data[fieldName] = result.map((subResult: any) =>
                        scalarType && subResult !== null ? scalarType.parseValue(subResult) : subResult
                      )
                    } else {
                      data[fieldName] = scalarType && result !== null ? scalarType.parseValue(result) : result
                    }
                    return
                  }

                  if (this.enumMap.has(fieldType)) {
                    data[fieldName] = result
                    return
                  }

                  if (this.unionMap.has(fieldType) || this.interfaceMap.has(fieldType)) {
                    const possibleTypes = this.unionMap.has(fieldType)
                      ? this.unionMap.get(fieldType)!
                      : this.interfaceMap.get(fieldType)!
                    const typeResolver = asResolvers(this.resolvers[fieldType]).__resolveType
                    if (!typeResolver) {
                      throw new GraphQLError(`${fieldType}.__resolveType method is missing`)
                    }

                    const processTypeName = (typeName: string | null, subResult: any) => {
                      typeName = typeName === undefined ? null : typeName
                      if (typeName === null) {
                        return null
                      }

                      if (!possibleTypes.has(typeName)) {
                        throw new GraphQLError(`Union ${fieldName} cannot resolve to type ${typeName}`)
                      }

                      if (this.scalarMap.has(fieldType)) {
                        const scalarType = this.scalarMap.get(fieldType)
                        return scalarType && result !== null ? scalarType.parseValue(result) : result
                      }

                      if (!selection.selectionSet) {
                        errors.push(new GraphQLError(`Missing sub selection for field ${selection.name.value}`))
                        return null
                      }

                      const subType = this.objectMap.get(typeName)!
                      return processSelectionSet(selection.selectionSet, subType, subResult)
                    }

                    if (isListSelection) {
                      data[fieldName] = []
                      result.forEach((subResult: any) => {
                        promiseRegistry.add(
                          Promise.resolve(typeResolver(subResult, context, resolveInfo)).then(typeName =>
                            data[fieldName].push(processTypeName(typeName, subResult))
                          )
                        )
                      })
                    } else {
                      promiseRegistry.add(
                        Promise.resolve(typeResolver(result, context, resolveInfo)).then(typeName => {
                          const r = processTypeName(typeName, result)
                          data[fieldName] = r
                        })
                      )
                    }
                    return
                  }

                  if (this.objectMap.has(fieldType)) {
                    if (!selection.selectionSet) {
                      throw new GraphQLError(`Missing sub selection for field ${selection.name.value}`)
                    }

                    if (result === null) {
                      data[fieldName] = null
                      return
                    }

                    const subType = this.objectMap.get(fieldType)!
                    if (isListSelection) {
                      data[fieldName] = result.map((subResult: any) =>
                        processSelectionSet(selection.selectionSet!, subType, subResult)
                      )
                    } else {
                      data[fieldName] = processSelectionSet(selection.selectionSet, subType, result)
                    }
                    return
                  }

                  throw new GraphQLError(`Unknown type ${fieldType}`)
                })
            )
            executionChain = executeSequentially ? resultPromise : Promise.resolve()
            break
          }
          case 'FragmentSpread': {
            const fragment = fragments[selection.name.value]
            if (!fragment) {
              errors.push(new GraphQLError(`Missing fragment ${selection.name.value}`))
              break
            }

            data[SPREAD + ++spreadIndex] = processSelectionSet(fragment.selectionSet, type, parentData)
            break
          }
          case 'InlineFragment': {
            if (selection.typeCondition?.name.value !== type.name.value) {
              break
            }

            data[SPREAD + ++spreadIndex] = processSelectionSet(selection.selectionSet, type, parentData)
            break
          }
        }
      }

      executeSequentially = false
      return data
    }

    const data = processSelectionSet(mainOperation.selectionSet, mainType, rootData)
    await promiseRegistry.all()

    return { data: this.compose(data), errors: errors.length === 0 ? undefined : errors }
  }
}
