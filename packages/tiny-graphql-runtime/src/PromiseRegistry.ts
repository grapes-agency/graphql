export class PromiseRegistry {
  private promises = new Set()

  public add(promise: Promise<any> | (() => Promise<any>)) {
    this.promises.add(typeof promise === 'function' ? promise() : promise)
    return promise
  }

  public async all() {
    let currentPromiseCount = 0
    let nextPromiseCount = this.promises.size

    while (nextPromiseCount > currentPromiseCount) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(this.promises.values())
      currentPromiseCount = nextPromiseCount
      nextPromiseCount = this.promises.size
    }

    this.promises.clear()
  }
}
