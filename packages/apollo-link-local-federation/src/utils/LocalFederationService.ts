import { Operation, gql, FetchResult, Observable } from '@apollo/client/core'
import type { LocalSchemaLink } from '@grapes-agency/apollo-link-local-schema'
import { unwrapType } from '@grapes-agency/tiny-graphql-runtime/helpers'
import { TypeNode } from 'graphql'

interface LocalFederationServiceOptions {
  name: string
  link: LocalSchemaLink
}

export class LocalFederationService {
  public name: string
  private link: LocalSchemaLink
  private federationSupport: ReturnType<LocalSchemaLink['__addFederationSupport']>

  constructor({ name, link }: LocalFederationServiceOptions) {
    this.name = name
    this.link = link
    this.federationSupport = link.__addFederationSupport({
      serviceName: name,
    })
  }

  public getType(nameOrType: string | TypeNode) {
    if (typeof nameOrType === 'string') {
      return this.federationSupport.getType(nameOrType)
    }
    return this.federationSupport.getType(unwrapType(nameOrType).name.value)
  }

  public queryType(typeName: string) {
    return this.execute({
      query: gql`
        query ResolveType {
          __resolveType(typeName: "${typeName}")
        }
      `,
    })
  }

  public execute<T extends Record<string, any> = Record<string, any>>(
    operation: Pick<Operation, 'query'> & Partial<Omit<Operation, 'query'>>
  ) {
    if (!operation.variables) {
      operation.variables = {}
    }

    if (!operation.operationName) {
      operation.operationName = ''
    }

    if (!operation.extensions) {
      operation.extensions = {}
    }

    if (!operation.getContext) {
      operation.getContext = () => ({})
    }

    if (!operation.setContext) {
      operation.setContext = c => c
    }

    return this.link.request(operation as Operation) as Observable<FetchResult<T>> | null
  }
}
