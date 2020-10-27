export class PromiseRegistry extends Set<Promise<any>> {
  public async all() {
    let currentPromiseCount = 0
    let nextPromiseCount = this.size

    while (nextPromiseCount > currentPromiseCount) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(this.values())
      currentPromiseCount = nextPromiseCount
      nextPromiseCount = this.size
    }
  }
}
