/* eslint-disable no-await-in-loop */
import { FetchResult, Operation } from '@apollo/client/core'
import { getMainDefinition, Observable } from '@apollo/client/utilities'
import { isNonNullType, isListType } from '@grapes-agency/tiny-graphql-runtime'
import { DocumentNode, FieldNode, SelectionNode, visit, GraphQLError, NamedTypeNode } from 'graphql'
import getByPath from 'lodash/get'
import mergeWith from 'lodash/mergeWith'
import setByPath from 'lodash/set'

import type { LocalFederationService } from './LocalFederationService'
import { distributeQuery, DocumentInfo } from './distributeQuery'
import { getWithPath } from './getWithPath'
import { isSubscription as isSubscriptionType } from './isSubscription'
import { observablePromise } from './observablePromise'
import { sanitizeResults } from './sanitizeResult'

const isFieldNode = (node: SelectionNode): node is FieldNode => node.kind === 'Field'

const mergeCustomizer = (_prevValue: any, nextValue: any) => {
  if (Array.isArray(nextValue)) {
    return nextValue
  }
}

export class ResolutionStrategy {
  protected initialDocuments = new Set<DocumentInfo>()
  protected extensionDocuments = new Map<string, DocumentInfo>()
  protected distributionErrors: Array<GraphQLError> = []
  public deltaQuery!: DocumentNode | null

  constructor(private query: DocumentNode, services: Array<LocalFederationService>) {
    for (const service of services) {
      const [documents, errors] = distributeQuery(query, service, services)
      this.distributionErrors.push(...errors)
      if (!documents) {
        continue
      }

      documents.forEach((documentInfo, path) => {
        if (path === '') {
          this.initialDocuments.add(documentInfo)
        } else if (this.extensionDocuments.has(path)) {
          const { service: previousService } = this.extensionDocuments.get(path)!
          throw new Error(`Service ${previousService.name} and ${documentInfo.service.name} both resolve the same field!`)
        } else {
          this.extensionDocuments.set(path, documentInfo)
        }
      })
    }

    this.calculateDeltaQuery(query)
  }

  private calculateDeltaQuery(query: DocumentNode) {
    const handledMainFields = new Set<string>()

    const allDocuments = [...this.initialDocuments.values(), ...this.extensionDocuments.values()]
    for (const { document } of allDocuments) {
      getMainDefinition(document)
        .selectionSet.selections.filter(isFieldNode)
        .forEach(field => handledMainFields.add(field.name.value))
    }

    const fieldPath: Array<string> = []
    const usedFragments = new Set<string>()
    const firstPass: DocumentNode = visit(query, {
      OperationDefinition: {
        leave(operationDefinition) {
          if (operationDefinition.selectionSet.selections.length === 0) {
            return null
          }
        },
      },
      FragmentSpread(fragmentSpread) {
        usedFragments.add(fragmentSpread.name.value)
      },
      Field: {
        enter(field) {
          const name = field.name.value
          if (fieldPath.length === 0 && handledMainFields.has(name)) {
            return null
          }

          fieldPath.push(name)
        },
        leave() {
          fieldPath.pop()
        },
      },
    })

    let hasOperationDefinition = false
    const deltaQuery: DocumentNode = visit(firstPass, {
      OperationDefinition() {
        hasOperationDefinition = true
      },
      FragmentDefinition(fragmentDefinition) {
        if (!usedFragments.has(fragmentDefinition.name.value)) {
          return null
        }
      },
    })

    this.deltaQuery = !hasOperationDefinition || deltaQuery.definitions.length === 0 ? null : deltaQuery
  }

  protected executeInitial(operation: Operation, isSubscription: boolean): Observable<FetchResult> | null {
    if (isSubscription && this.initialDocuments.size > 1) {
      throw new GraphQLError('Subscription cannot be merged between services')
    }

    if (this.initialDocuments.size === 0) {
      return null
    }

    if (isSubscription) {
      const [{ document, service }] = this.initialDocuments
      operation.query = document
      return service.execute(operation)
    }

    return new Observable(observer => {
      let resultData: Record<string, any> = {}
      const resultErrors: Array<GraphQLError> = []

      Promise.all(
        Array.from(this.initialDocuments).map(({ document, service }) => {
          operation.query = document
          return service.execute(operation)?.forEach(r => {
            if (r.data) {
              resultData = mergeWith(resultData, r.data, mergeCustomizer)
            }
            if (r.errors) {
              resultErrors.push(...r.errors)
            }
          })
        })
      ).then(() => {
        observer.next({
          data: Object.keys(resultData).length > 0 ? resultData : null,
          errors: resultErrors.length > 0 ? resultErrors : undefined,
        })
        observer.complete()
      })
    })
  }

  protected async executeRest(rootData: FetchResult, operation: Operation): Promise<FetchResult> {
    const errors = [...(rootData.errors || [])]
    const extensionCache = new Map<string, any>()
    const extendData = async (
      baseData: Record<string, any>,
      operationData: Record<string, any> | null,
      path: string,
      info: DocumentInfo
    ) => {
      if (!operationData) {
        return
      }
      const sanitizedOperationData = sanitizeResults(operationData, info.keyDocument!)

      if (sanitizedOperationData === null || Object.keys(sanitizedOperationData).length === 0) {
        errors.push(new GraphQLError(`Cannot extend type ${info.typename}. No data available`))
        return
      }

      operation.query = info.document
      operation.variables = {
        typename: info.typename!,
        operationData: sanitizedOperationData,
      }

      const cacheKey = `${info.service.name}_${JSON.stringify(operation.query)}_${JSON.stringify(operation.variables)}`
      let result: any
      if (extensionCache.has(cacheKey)) {
        result = extensionCache.get(cacheKey)
      } else {
        const observable = info.service.execute(operation)
        const extension = await observablePromise(observable)
        result = extension?.data?.__resolveType || extension?.data?.__extendType || null
        extensionCache.set(cacheKey, result)

        if (extension?.errors) {
          errors.push(...extension.errors)
        }
      }
      if (result === null && !info.extension) {
        setByPath(baseData, path, null)
      } else {
        setByPath(baseData, path, Object.assign(getByPath(baseData, path, {}), result))
      }
    }

    const clearNull = (baseData: Record<string, any>, path: string) => {
      setByPath(
        baseData,
        path,
        (getByPath(baseData, path) as Array<any>).filter(d => d !== null)
      )
    }

    const getTypeInfo = (info: DocumentInfo) => {
      let fieldType = info.fieldDefinition?.type ?? null
      let required = false
      let listItemRequired = false

      if (fieldType && isNonNullType(fieldType)) {
        required = true
        fieldType = fieldType.type
      }

      if (fieldType && isListType(fieldType)) {
        fieldType = fieldType.type
        if (isNonNullType(fieldType)) {
          listItemRequired = true
          fieldType = fieldType.type
        }
      }

      return {
        fieldType: fieldType as null | NamedTypeNode,
        required,
        listItemRequired,
      }
    }

    const data = { ...rootData.data }
    for (const [path, info] of this.extensionDocuments) {
      const operationData = getWithPath(data, path)
      const typeInfo = getTypeInfo(info)

      for (const opData of operationData) {
        if (Array.isArray(opData.data)) {
          await Promise.all(opData.data.map((d, i) => extendData(data, d, `${opData.path}[${i}]`, info)))
          if (typeInfo.listItemRequired) {
            clearNull(data, opData.path)
          }
        } else {
          await extendData(data, opData.data, opData.path, info)
          if (typeInfo.required && getByPath(data, path) === null) {
            throw new GraphQLError(`Cannot return null for non-nullable field ${typeInfo.fieldType!.name.value}`)
          }
        }
      }
    }

    return { data: sanitizeResults(data, this.query), errors: errors.length === 0 ? undefined : errors }
  }

  public execute(operation: Operation): Observable<FetchResult> {
    const isSubscription = isSubscriptionType(operation.query)

    return new Observable(observer => {
      let observable: Observable<FetchResult> | null
      try {
        observable = this.executeInitial(operation, isSubscription)
        if (!observable) {
          observer.next({ data: null })
          observer.complete()
          return
        }
      } catch (error) {
        observer.next({ data: null, errors: [error, ...this.distributionErrors] })
        observer.complete()
        return
      }

      const subscription = observable.subscribe({
        ...observer,
        next: async result => {
          if (result.data === null) {
            observer.next(result)
          } else {
            const { data, errors } = await this.executeRest(result, operation)
            const allErrors = [...(errors || []), ...this.distributionErrors]
            observer.next({ data, errors: allErrors.length > 0 ? allErrors : undefined })
          }
          if (!isSubscription) {
            observer.complete()
          }
        },
      })

      return () => subscription.unsubscribe()
    })
  }
}
