import { ApolloLink, Operation, NextLink, Observable, FetchResult } from '@apollo/client/core'
import { LocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import { DocumentNode } from 'graphql'

import { IntrospectionService } from './introspection'
import { LocalFederationService, ResolutionStrategy } from './utils'

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

    operation.query = resolutionStrategy.deltaQuery
    return observable.concat(forward(operation))
  }
}

export const createLocalFederationLink = (options: LocalFederationLinkOptions) => new LocalFederationLink(options)
