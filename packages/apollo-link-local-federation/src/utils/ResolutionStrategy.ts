/* eslint-disable no-await-in-loop */
import { FetchResult, Operation } from '@apollo/client/core'
import { getMainDefinition, Observable } from '@apollo/client/utilities'
import { DocumentNode, FieldNode, SelectionNode, visit, GraphQLError } from 'graphql'
import getByPath from 'lodash/get'
import merge from 'lodash/merge'
import setByPath from 'lodash/set'

import type { LocalFederationService } from './LocalFederationService'
import { distributeQuery, DocumentInfo } from './distributeQuery'
import { observablePromise } from './observablePromise'
import { sanitizeResults } from './sanitizeResult'

const isFieldNode = (node: SelectionNode): node is FieldNode => node.kind === 'Field'

export class ResolutionStrategy {
  protected initialDocuments = new Set<DocumentInfo>()
  protected extensionDocuments = new Map<string, DocumentInfo>()

  public deltaQuery!: DocumentNode | null

  constructor(private query: DocumentNode, services: Array<LocalFederationService>) {
    for (const service of services) {
      const documents = distributeQuery(query, service, services)
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
    if (isSubscription && this.initialDocuments.size > 0) {
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
      let result: FetchResult = { data: {}, errors: [] }
      Promise.all(
        Array.from(this.initialDocuments).map(({ document, service }) => {
          operation.query = document
          return service.execute(operation)?.forEach(r => {
            result = merge(result, { data: r.data || {}, errors: r.errors || {} })
          })
        })
      ).then(() => {
        observer.next({
          data: Object.keys(result.data!).length > 0 ? result.data : null,
          errors: result.errors!.length > 0 ? result.errors : undefined,
        })
        observer.complete()
      })
    })
  }

  protected async executeRest(rootData: FetchResult, operation: Operation): Promise<FetchResult> {
    const data = { ...rootData.data }
    const errors = [...(rootData.errors || [])]
    for (const [path, { typename, document, keyDocument, service }] of this.extensionDocuments) {
      const operationData = sanitizeResults(getByPath(data, path), keyDocument!)

      if (operationData === null || Object.keys(operationData).length === 0) {
        console.warn('No data for resolving')
        return data
      }

      operation.query = document
      operation.variables = {
        typename: typename!,
        operationData,
      }

      const observable = service.execute(operation)
      const extension = await observablePromise(observable)

      if (extension?.data) {
        setByPath(
          data,
          path,
          Object.assign(getByPath(data, path, {}), extension.data.__resolveType || extension.data.__extendType)
        )
      }
      if (extension?.errors) {
        errors.push(...extension.errors)
      }
    }

    return { data: sanitizeResults(data, this.query), errors: errors.length === 0 ? undefined : errors }
  }

  public execute(operation: Operation): Observable<FetchResult> {
    const mainDefinition = getMainDefinition(operation.query)
    const isSubscription = mainDefinition.kind === 'OperationDefinition' && mainDefinition.operation === 'subscription'

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
        observer.next({ data: null, errors: [error] })
        observer.complete()
        return
      }

      const subscription = observable.subscribe({
        ...observer,
        next: async data => {
          const fullData = await this.executeRest(data, operation)
          observer.next(fullData)
          if (!isSubscription) {
            observer.complete()
          }
        },
      })

      return () => subscription.unsubscribe()
    })
  }
}
