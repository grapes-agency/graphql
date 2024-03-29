import type { Operation, NextLink, FetchResult } from '@apollo/client/core'
import { ApolloLink, Observable } from '@apollo/client/core'
import { getMainDefinition } from '@apollo/client/utilities'
import type { Resolvers, SchemaDirectiveVisitor } from '@grapes-agency/tiny-graphql-runtime'
import { GraphQLRuntime } from '@grapes-agency/tiny-graphql-runtime'
import type { DocumentNode, OperationDefinitionNode, ObjectTypeDefinitionNode } from 'graphql'
import merge from 'lodash/merge'

import type { DocumentsPair } from './interfaces'
import { introspectionTypeDefs, createIntrospectionResolvers } from './introspection'
import { LocalFederationSupport } from './localFederation'
import { default as commonTypeDefs } from './typeDefs.graphql'
import { mergeDocuments, splitDocument } from './utils'

interface LocalSchemaLinkOptions<Context = any> {
  typeDefs: DocumentNode | Array<DocumentNode>
  resolvers?: Resolvers<Context> | Array<Resolvers<Context>>
  context?: Context | ((operation: Operation) => Context)
  introspection?: boolean
  schemaDirectives?: Record<string, SchemaDirectiveVisitor>
}

interface FederatedInfo {
  serviceName: string
}

export class LocalSchemaLink<Context = any> extends ApolloLink {
  private processedDocuments = new Map<DocumentNode, DocumentsPair>()
  private context: Context | ((operation: Operation) => Context) | undefined
  private initalized = false
  private federated?: LocalFederationSupport
  private runtime!: GraphQLRuntime

  constructor(private options: LocalSchemaLinkOptions<Context>) {
    super()
  }

  private init() {
    if (this.initalized) {
      return
    }

    const { typeDefs, resolvers, context, introspection = true, schemaDirectives } = this.options

    let mergedTypeDefs = mergeDocuments(Array.isArray(typeDefs) ? [commonTypeDefs, ...typeDefs] : [commonTypeDefs, typeDefs])
    const resolversArray = Array.isArray(resolvers) ? resolvers : [resolvers]

    if (introspection) {
      resolversArray.unshift(createIntrospectionResolvers(mergedTypeDefs, { federated: Boolean(this.federated) }))
      mergedTypeDefs = mergeDocuments([introspectionTypeDefs, mergedTypeDefs])
    }

    let mergedResolvers = merge(resolversArray[0], ...resolversArray.slice(1))

    if (this.federated) {
      ;[mergedTypeDefs, mergedResolvers] = this.federated.patch(mergedTypeDefs, mergedResolvers)
    }

    this.runtime = new GraphQLRuntime({
      typeDefs: mergedTypeDefs,
      resolvers: mergedResolvers,
      allowObjectExtensionAsTypes: true,
      schemaDirectives,
    })
    this.context = context

    this.initalized = true
  }

  private getContext(operation: Operation) {
    let { context } = this
    if (typeof context === 'function') {
      context = (context as (operation: Operation) => Context)(operation)
    }
    return { ...context, ...operation.getContext() }
  }

  public __addFederationSupport(info: FederatedInfo) {
    this.federated = new LocalFederationSupport(info.serviceName)
    this.init()
    return this.federated
  }

  private splitDocuments(document: DocumentNode): DocumentsPair {
    if (this.processedDocuments.has(document)) {
      return this.processedDocuments.get(document)!
    }

    const { operation } = getMainDefinition(document) as OperationDefinitionNode
    const operationDefinition =
      operation === 'query'
        ? this.runtime.queryType
        : operation === 'mutation'
        ? this.runtime.mutationType
        : this.runtime.subscriptionType

    const documentsPair = splitDocument(document, operationDefinition as ObjectTypeDefinitionNode)
    this.processedDocuments.set(document, documentsPair)
    return documentsPair
  }

  public request(operation: Operation, forward?: NextLink): Observable<FetchResult> | null {
    this.init()
    const { query, variables } = operation
    const mainDefinition = getMainDefinition(query) as OperationDefinitionNode
    const [internalQuery, externalQuery] = this.federated ? [query, null] : this.splitDocuments(query)
    const isSubscription = mainDefinition.operation === 'subscription'

    if (isSubscription && internalQuery && externalQuery) {
      throw new Error('Subscriptions cannot be a mix of local and external subscriptions')
    }

    let nonLocalObservable = Observable.of<FetchResult>({ data: {} })

    if (forward) {
      if (!internalQuery) {
        return forward(operation)
      }

      if (externalQuery) {
        // eslint-disable-next-line no-param-reassign
        operation.query = externalQuery
        nonLocalObservable = forward(operation)
      }
    }

    if (!isSubscription) {
      return nonLocalObservable.flatMap(
        remoteResult =>
          new Observable(observer => {
            this.runtime
              .execute({
                query: internalQuery!,
                context: this.getContext(operation),
                args: variables,
              })
              .then(({ data, errors }) => {
                const combinedErrors = [...(errors || []), ...(remoteResult.errors || [])]
                observer.next({
                  data: {
                    ...data,
                    ...remoteResult.data,
                  },
                  errors: combinedErrors.length > 0 ? combinedErrors : undefined,
                })
                observer.complete()
              })
              .catch(error => {
                observer.next({ errors: [{ message: error.message } as any] })
                observer.complete()
              })
          })
      )
    }

    return new Observable(observer => {
      let subscription: ZenObservable.Subscription

      this.runtime
        .execute({ query: internalQuery!, context: this.getContext(operation), args: variables })
        .then(({ data, errors }) => {
          if (!data) {
            observer.complete()
            return
          }

          if (errors) {
            observer.next({ errors })
            observer.complete()
            return
          }

          const observables = Array.from(Object.values(data as { [key: string]: Observable<any> }), observable =>
            observable.map(result => ({ data: result }))
          )
          if (observables.length === 0) {
            observer.complete()
            return
          }

          let observable = observables[0]
          if (observables.length > 1) {
            observable = observable.concat(...observables.slice(1))
          }
          subscription = observable.subscribe({
            next: nextData => observer.next(nextData),
            error: error => {
              observer.next({ errors: [error] })
              observer.complete()
            },
            complete: () => observer.complete(),
          })
        })
        .catch(error => {
          observer.next({ errors: [{ message: error.message } as any] })
          observer.complete()
        })

      return () => {
        if (subscription) {
          subscription.unsubscribe()
        }
      }
    })
  }
}

export const createLocalSchemaLink = <Context = any>(options: LocalSchemaLinkOptions<Context>) =>
  new LocalSchemaLink<Context>(options)
