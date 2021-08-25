/* eslint-disable no-await-in-loop */
import type {
  DocumentNode,
  ObjectTypeDefinitionNode,
  FieldDefinitionNode,
  ExecutionResult,
  SelectionSetNode,
  GraphQLScalarType,
  DirectiveDefinitionNode,
  SelectionNode,
  ObjectTypeExtensionNode,
  DirectiveNode,
} from 'graphql'
import { specifiedScalarTypes, GraphQLError, isScalarType, visit } from 'graphql'
import Observable from 'zen-observable'

import { GraphQLCompountError } from './GraphQLCompountError'
import { PromiseRegistry } from './PromiseRegistry'
import type { SchemaDirectiveVisitor } from './SchemaDirectiveVisitor'
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
  isInputObjectTypeDefinition,
} from './helpers'
import type {
  Resolvers,
  Resolver,
  FieldResolver,
  SubscriptionResolver,
  ResolveInfo,
  FieldDefinitionNodeWithResolver,
  InputObjectTypeDefinitionNodeWithResolver,
} from './interfaces'
import { isObject, mergeDeep } from './utils'

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

const cloneTypeDefs = (typeDefs: DocumentNode): DocumentNode =>
  visit(typeDefs, {
    FieldDefinition: fieldDefinition => ({
      ...fieldDefinition,
    }),
    InputValueDefinition: inputValueDefinition => ({ ...inputValueDefinition }),
  })

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
  schemaDirectives?: Record<string, SchemaDirectiveVisitor>
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
  private inputMap: Map<string, InputObjectTypeDefinitionNodeWithResolver>
  private unionMap: Map<string, Set<string>>
  private interfaceMap: Map<string, Set<string>>
  private scalarMap: Map<string, GraphQLScalarType | null>
  private enumMap: Map<string, Array<string>>
  private directiveMap: Map<string, DirectiveDefinitionNode>
  private defaultResolver: Resolver
  private resolversReady: Promise<void>

  public queryType: ObjectTypeDefinitionNode | null
  public mutationType: ObjectTypeDefinitionNode | null
  public subscriptionType: ObjectTypeDefinitionNode | null

  constructor({
    typeDefs: originalTypeDefs,
    resolvers: originalResolvers = {},
    defaultResolver: dResolver = defaultResolver,
    allowObjectExtensionAsTypes = false,
    schemaDirectives = {},
  }: GraphQLRuntimeOptions) {
    const typeDefs = cloneTypeDefs(originalTypeDefs)
    const resolvers = { ...originalResolvers }

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

    this.inputMap = new Map(
      typeDefs.definitions
        .filter(isInputObjectTypeDefinition)
        .map(definition => [definition.name.value, definition as InputObjectTypeDefinitionNodeWithResolver])
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
      typeDefs.definitions
        .filter(isEnumTypeDefinition)
        .map(definition => [definition.name.value, definition.values?.map(value => value.name.value) || []])
    )

    this.directiveMap = new Map(
      [...(typeDefs.definitions.filter(isDirectiveDefinition) as Array<DirectiveDefinitionNode>), ...defaultDirectives].map(
        definition => [definition.name.value, definition]
      )
    )

    this.scalarMap = new Map([
      ...specifiedScalarTypes.map<[string, GraphQLScalarType]>(scalarType => [scalarType.name, scalarType]),
      ...typeDefs.definitions
        .filter(isScalarTypeDefinition)
        .map<[string, GraphQLScalarType | null]>(scalarDefinition => [
          scalarDefinition.name.value,
          (resolvers[scalarDefinition.name.value] as unknown as GraphQLScalarType) || null,
        ]),
    ])
    const schemaDefinition = typeDefs.definitions.find(isSchemaDefinition)
    const toObjectTypeDefinition = (
      type?: ObjectTypeDefinitionNode | ObjectTypeExtensionNode
    ): ObjectTypeDefinitionNode | null => {
      if (!type) {
        return null
      }
      if (type.kind === 'ObjectTypeDefinition') {
        return type
      }

      if (!allowObjectExtensionAsTypes) {
        return null
      }

      return {
        ...type,
        kind: 'ObjectTypeDefinition',
      }
    }

    const queryTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'query')?.type.name.value || 'Query'
    const possibleQueryType = this.objectMap.get(queryTypeName)
    this.queryType = toObjectTypeDefinition(possibleQueryType)

    const mutationTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'mutation')?.type.name.value ||
      'Mutation'
    const possibleMutationType = this.objectMap.get(mutationTypeName)
    this.mutationType = toObjectTypeDefinition(possibleMutationType)
    const subscriptionTypeName =
      schemaDefinition?.operationTypes.find(operationType => operationType.operation === 'subscription')?.type.name.value ||
      'Subscription'
    const possibleSubscriptionType = this.objectMap.get(subscriptionTypeName)
    this.subscriptionType = toObjectTypeDefinition(possibleSubscriptionType)

    this.resolversReady = this.mapResolversToFields({ typeDefs, resolvers, schemaDirectives })
  }

  protected async mapResolversToFields({
    typeDefs,
    resolvers,
    schemaDirectives,
  }: Required<Pick<GraphQLRuntimeOptions, 'typeDefs' | 'resolvers' | 'schemaDirectives'>>) {
    let objectNameLookupList: Array<string> | null = null
    const promiseRegistry = new PromiseRegistry()
    const mapDirectiveDefinitions = (
      target: { directives?: ReadonlyArray<DirectiveNode> },
      mapper: (visitor: SchemaDirectiveVisitor, args: Record<string, any>) => void
    ) => {
      target.directives?.forEach(async directive => {
        const name = directive.name.value
        const definition = this.directiveMap.get(name)
        if (definition) {
          const visitor = schemaDirectives[name]
          if (visitor) {
            const args = await promiseRegistry.add(
              generateArgs({
                parentName: `@${name}`,
                inputMap: this.inputMap,
                enumMap: this.enumMap,
                scalarMap: this.scalarMap,
                argDefinitions: definition.arguments,
                args: directive.arguments,
              })
            )
            mapper(visitor, args)
          }
        } else {
          throw new GraphQLError(`Cannot use schemaDirective for unknown directive @${name}`)
        }
      })
    }

    visit(typeDefs, {
      ObjectTypeDefinition: {
        enter: objectTypeDefinition => {
          objectNameLookupList = [
            objectTypeDefinition.name.value,
            ...(objectTypeDefinition.interfaces?.map(iface => iface.name.value) || []),
          ]
        },
      },
      ObjectTypeExtension: {
        enter: objectTypeExtension => {
          objectNameLookupList = [
            objectTypeExtension.name.value,
            ...(objectTypeExtension.interfaces?.map(iface => iface.name.value) || []),
          ]
        },
        leave: () => {
          objectNameLookupList = null
        },
      },
      InputObjectTypeDefinition: {
        enter: inputObjectType => {
          objectNameLookupList = [inputObjectType.name.value]
          mapDirectiveDefinitions(inputObjectType, (visitor, args) => {
            visitor.visitInputObjectDefinition?.(inputObjectType as InputObjectTypeDefinitionNodeWithResolver, args)
          })
        },
        leave: () => {
          objectNameLookupList = null
        },
      },
      InputValueDefinition: inputValue => {
        if (objectNameLookupList) {
          for (const objectName of objectNameLookupList) {
            const resolver = asResolvers(resolvers[objectName])[inputValue.name.value]
            if (resolver) {
              ;(inputValue as any).resolve = resolver
              break
            }
          }
        }
        mapDirectiveDefinitions(inputValue, (visitor, args) => {
          visitor.visitInputValueDefinition?.(inputValue, args)
        })
      },
      FieldDefinition: field => {
        let resolver = this.defaultResolver
        if (objectNameLookupList) {
          for (const objectName of objectNameLookupList) {
            const fieldResolver = asResolvers(resolvers[objectName])[field.name.value]
            if (fieldResolver) {
              resolver = fieldResolver
              break
            }
          }
        }

        ;(field as FieldDefinitionNodeWithResolver).resolve = resolver

        mapDirectiveDefinitions(field, (visitor, args) => {
          visitor.visitFieldDefinition?.(field as FieldDefinitionNodeWithResolver, args)
        })
      },
    })

    return promiseRegistry.all()
  }

  protected async processDirectives(selection: SelectionNode, args: Record<string, any>) {
    const combinedDirectives: Record<string, any> = {}

    if (!selection.directives) {
      return combinedDirectives
    }

    for (const directive of selection.directives) {
      const schemaDirective = this.directiveMap.get(directive.name.value)
      if (!schemaDirective) {
        continue
      }

      const locations = schemaDirective.locations.map(loc => loc.value)
      if (selection.kind === 'Field' && !locations.includes('FIELD')) {
        continue
      }

      if (selection.kind === 'FragmentSpread' && !locations.includes('FRAGMENT_SPREAD')) {
        continue
      }

      if (selection.kind === 'InlineFragment' && !locations.includes('INLINE_FRAGMENT')) {
        continue
      }

      const directiveName = directive.name.value
      combinedDirectives[directiveName] = await generateArgs({
        parentName: `@${directiveName}`,
        inputMap: this.inputMap,
        enumMap: this.enumMap,
        scalarMap: this.scalarMap,
        specifiedArgs: args,
        argDefinitions: schemaDirective.arguments,
        args: directive.arguments,
      })
    }

    return combinedDirectives
  }

  protected compose(data: Record<string, any>): Record<string, any> {
    for (const key of Object.keys(data)) {
      const value = data[key]
      if (Array.isArray(value)) {
        data[key] = value.map(v => this.compose(v))
      }

      if (isObject(value)) {
        data[key] = this.compose(value)
      }

      if (key.startsWith(SPREAD)) {
        delete data[key]
        mergeDeep(data, value)
      }
    }

    return data
  }

  public async execute({ rootData = null, query, context, args = {} }: ExecutionOptions): Promise<ExecutionResult> {
    await this.resolversReady
    const mainOperation = query.definitions.find(isOperationDefinition)
    if (!mainOperation) {
      return { errors: [new GraphQLError('Operation definition missing')] }
    }

    for (const { variable, defaultValue, type } of mainOperation.variableDefinitions || []) {
      const name = variable.name.value

      if (name in args) {
        break
      }

      if (defaultValue) {
        switch (defaultValue.kind) {
          case 'Variable':
          case 'ObjectValue': {
            throw new GraphQLError(`Default value of variable ${name} cannot be of type ${defaultValue.kind}`)
          }
          case 'NullValue': {
            args[name] = null
            break
          }
          case 'ListValue': {
            args[name] = defaultValue.values
            break
          }
          default: {
            args[name] = defaultValue.value
          }
        }
        break
      }

      if (type.kind === 'NonNullType') {
        return {
          errors: [new GraphQLError(`Missing variable ${name}`)],
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

      ;(async () => {
        for (const selection of selectionSet.selections) {
          const directives = await promiseRegistry.add(this.processDirectives(selection, args))

          const skip = directives.skip?.if === true || directives.include?.if === false

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

              const resolver =
                field === typenameFieldDefinition
                  ? () => type.name.value
                  : type.name.value === '__SUBSCRIPTON__'
                  ? this.defaultResolver
                  : (field as FieldDefinitionNodeWithResolver).resolve

              const argsPromise = generateArgs({
                parentName: fieldName,
                inputMap: this.inputMap,
                enumMap: this.enumMap,
                scalarMap: this.scalarMap,
                specifiedArgs: args,
                argDefinitions: field.arguments,
                args: selection.arguments,
                context,
              }).catch(error => {
                data[fieldName] = null

                if (error instanceof GraphQLCompountError) {
                  errors.push(...error.errors)
                } else {
                  errors.push(error)
                }

                throw error
              })

              if (skip) {
                break
              }

              if (expectSubscription) {
                expectSubscription = false

                const mapSubscriptionResult = (result: any) =>
                  new Observable(observer => {
                    const processsedData = processSelectionSet(
                      selectionSet,
                      { ...type, name: { kind: 'Name', value: '__SUBSCRIPTON__' } },
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
                  promiseRegistry.add(async () => {
                    let generatedArgs: Record<string, any>
                    try {
                      generatedArgs = await argsPromise
                    } catch {
                      return
                    }

                    const result = await resolver(parentData, generatedArgs, context, resolveInfo)
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
                }
                break
              }
              let resultPromise: Promise<any>
              if (executeSequentially) {
                executionChain = executionChain.then(async () => {
                  let generatedArgs: Record<string, any>
                  try {
                    generatedArgs = await argsPromise
                  } catch {
                    return
                  }
                  return (resolver as FieldResolver)(parentData, generatedArgs, context, resolveInfo)
                })
                resultPromise = executionChain
              } else {
                resultPromise = Promise.resolve().then(async () => {
                  let generatedArgs: Record<string, any>
                  try {
                    generatedArgs = await argsPromise
                  } catch {
                    return
                  }

                  return (resolver as FieldResolver)(parentData, generatedArgs, context, resolveInfo)
                })
              }

              promiseRegistry.add(
                resultPromise
                  .catch(error => {
                    if (error instanceof GraphQLError) {
                      errors.push(error)
                    } else {
                      errors.push(new GraphQLError(error.message, null, null, null, null, error, error.extensions))
                    }
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
                      const possibleValues = this.enumMap.get(fieldType)!
                      for (const r of Array.isArray(result) ? result : [result]) {
                        if (!possibleValues.includes(r)) {
                          errors.push(new GraphQLError(`Enum "${fieldType}" cannot represent value: "${r}"`))
                          return null
                        }
                      }

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
              if (skip) {
                break
              }
              const fragment = fragments[selection.name.value]
              if (!fragment) {
                errors.push(new GraphQLError(`Missing fragment ${selection.name.value}`))
                break
              }

              data[SPREAD + ++spreadIndex] = processSelectionSet(fragment.selectionSet, type, parentData)
              break
            }
            case 'InlineFragment': {
              if (skip) {
                break
              }
              if (selection.typeCondition?.name.value !== type.name.value) {
                break
              }

              data[SPREAD + ++spreadIndex] = processSelectionSet(selection.selectionSet, type, parentData)
              break
            }
          }
        }

        executeSequentially = false
      })()

      return data
    }

    try {
      const data = processSelectionSet(mainOperation.selectionSet, mainType, rootData)
      await promiseRegistry.all()
      const x = this.compose(data)
      return { data: x, errors: errors.length === 0 ? undefined : errors }
    } catch (error) {
      return { data: null, errors: errors.length === 0 ? [error] : errors }
    }
  }
}
