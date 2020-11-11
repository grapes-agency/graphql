import { DataSourceError } from './DataSourceError'

type Body = ArrayBuffer | ArrayBufferView | string | object
type URLSearchParamsInit = URLSearchParams | Record<string, any>

type RawRequestOptions = Omit<RequestInit, 'body'>

interface BaseRequestOptions extends RawRequestOptions {
  path: string
  body?: Body
  params?: URLSearchParamsInit
}

export interface RequestOptions extends BaseRequestOptions {
  params: URLSearchParams
  headers: Headers
}

export abstract class RESTDataSource {
  protected memoizedResults = new Map<string, Promise<any>>()
  protected baseUri?: string

  protected resolveURL(request: BaseRequestOptions) {
    let { path } = request
    if (path.startsWith('/')) {
      path = path.slice(1)
    }

    if (this.baseUri) {
      const normalizedBaseUri = this.baseUri.endsWith('/') ? this.baseUri : this.baseUri.concat('/')
      return new URL(path, normalizedBaseUri)
    }
    return new URL(path)
  }

  protected async errorFromResponse(response: Response) {
    return new DataSourceError(`${response.status}: ${response.statusText}`, {
      response: {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        body: await this.parseBody(response),
      },
    })
  }

  protected parseBody(response: Response) {
    const contentType = response.headers.get('Content-Type')
    const contentLength = response.headers.get('Content-Length')

    if (
      response.status !== 204 &&
      contentLength !== '0' &&
      contentType &&
      (contentType.startsWith('application/json') || contentType.startsWith('application/hal+json'))
    ) {
      return response.json()
    }

    return response.text()
  }

  protected willSendRequest?(request: RequestOptions): void

  protected onResponse<TResult = any>(response: Response, request: Request): Response | Promise<TResult> {
    if (request.method === 'HEAD') {
      return response
    }

    if (response.ok) {
      return this.parseBody(response)
    } else {
      throw this.errorFromResponse(response)
    }
  }

  protected onError(error: Error, _request: Request) {
    throw error
  }

  protected cacheKeyFor(request: Request) {
    return request.url
  }

  protected fetch<TResult>(options: BaseRequestOptions): Promise<TResult> {
    if (!(options.params instanceof URLSearchParams)) {
      options.params = new URLSearchParams(options.params)
    }

    if (!(options.headers instanceof Headers)) {
      options.headers = new Headers(options.headers || {})
    }

    if (this.willSendRequest) {
      this.willSendRequest(options as RequestOptions)
    }

    const url = this.resolveURL(options)

    for (const [name, value] of options.params as URLSearchParams) {
      url.searchParams.append(name, value)
    }

    if (
      options.body !== undefined &&
      options.body !== null &&
      (options.body.constructor === Object ||
        Array.isArray(options.body) ||
        ((options.body as any).toJSON && typeof (options.body as any).toJSON === 'function'))
    ) {
      options.body = JSON.stringify(options.body)
    }

    if (!options.headers.has('Content-Type')) {
      options.headers.set('Content-Type', 'application/json')
    }

    const request = new Request(String(url), options as RequestInit)
    const cacheKey = this.cacheKeyFor(request)
    const executeRequest = async () => {
      try {
        const response = await fetch(request)
        return this.onResponse(response, request)
      } catch (error) {
        this.onError(error, request)
      }
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      let promise = this.memoizedResults.get(cacheKey)
      if (promise) {
        return promise
      }

      promise = executeRequest()
      this.memoizedResults.set(cacheKey, promise)
      return promise
    }

    this.memoizedResults.delete(cacheKey)
    return executeRequest()
  }

  protected get<TResult = any>(path: string, params?: URLSearchParamsInit, init?: RawRequestOptions) {
    return this.fetch<TResult>({ method: 'GET', path, params, ...init })
  }

  protected head(path: string, params?: URLSearchParamsInit, init?: RawRequestOptions) {
    return this.fetch<Response>({ method: 'HEAD', path, params, ...init })
  }

  protected post<TResult = any>(path: string, body?: Body, init?: RawRequestOptions) {
    return this.fetch<TResult>({ method: 'POST', path, body, ...init })
  }

  protected patch<TResult = any>(path: string, body?: Body, init?: RawRequestOptions) {
    return this.fetch<TResult>({ method: 'PATH', path, body, ...init })
  }

  protected put<TResult = any>(path: string, body?: Body, init?: RawRequestOptions) {
    return this.fetch<TResult>({ method: 'PUT', path, body, ...init })
  }

  protected delete(path: string, params?: URLSearchParamsInit, init?: RawRequestOptions) {
    return this.fetch({ method: 'DELETE', path, params, ...init })
  }
}
