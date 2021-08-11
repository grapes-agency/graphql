import { RESTDataSource as ClientRestDataSource} from '../RestDataSource'
import fetch, { Headers, Request } from 'node-fetch'

export abstract class RESTDataSource extends ClientRestDataSource {
  protected init() {
    this.fetch = fetch as any
    this.Headers = Headers as any
    this.Request = Request as any
  }
}