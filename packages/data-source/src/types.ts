export type Body = ArrayBuffer | ArrayBufferView | string | object
export type URLSearchParamsInit = URLSearchParams | Record<string, any>

export type RawRequestOptions = Omit<RequestInit, 'body'>

export type RawRequestOptionsWithParams = RawRequestOptions & { params?: URLSearchParamsInit }
export type RawRequestOptionsWithBody = RawRequestOptions & { body?: Body | null }

export interface BaseRequestOptions extends RawRequestOptions {
  path: string
  body?: Body | null
  params?: URLSearchParamsInit
}

export interface RequestOptions extends BaseRequestOptions {
  params: URLSearchParams
  headers: Headers
}
