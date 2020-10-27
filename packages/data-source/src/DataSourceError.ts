export class DataSourceError extends Error {
  constructor(message: string, public extraInfo?: any) {
    super(message)
  }
}
