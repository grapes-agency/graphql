import { ApolloLink, Operation, NextLink, Observable, FetchResult } from '@apollo/client/core'
import { createOperation } from '@apollo/client/link/utils'
import { LocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import { DocumentNode } from 'graphql'

import { IntrospectionService } from './introspection'
import { LocalFederationService, ResolutionStrategy, mergeObservables, isSubscription } from './utils'

export interface LocalFederationServiceDefinition {
  name: string
  link: LocalSchemaLink
}

interface LocalFederationLinkOptions {
  introspection?: boolean
  services: Array<LocalFederationServiceDefinition>
}

export class LocalFederationLink extends ApolloLink {
  private services: Array<LocalFederationService>
  private resolutionStrategies = new Map<DocumentNode, ResolutionStrategy>()

  constructor({ services, introspection = true }: LocalFederationLinkOptions) {
    super()
    this.services = services.map(service => new LocalFederationService(service))
    if (introspection) {
      this.services.unshift(new IntrospectionService(this.services))
    }
  }

  private getResolutionSrategy(document: DocumentNode) {
    if (this.resolutionStrategies.has(document)) {
      return this.resolutionStrategies.get(document)!
    }

    const resolutionStrategy = new ResolutionStrategy(document, this.services)
    this.resolutionStrategies.set(document, resolutionStrategy)
    return resolutionStrategy
  }

  request(operation: Operation, forward?: NextLink): Observable<FetchResult> | null {
    const resolutionStrategy = this.getResolutionSrategy(operation.query)

    const observable = resolutionStrategy.execute(operation)

    if (!(resolutionStrategy.deltaQuery && forward)) {
      return observable
    }

    const externalObserver = forward(
      createOperation(operation.getContext(), { ...operation, query: resolutionStrategy.deltaQuery })
    )

    if (isSubscription(resolutionStrategy.deltaQuery)) {
      return externalObserver
    }

    return mergeObservables(observable, externalObserver)
  }
}

export const createLocalFederationLink = (options: LocalFederationLinkOptions) => new LocalFederationLink(options)
