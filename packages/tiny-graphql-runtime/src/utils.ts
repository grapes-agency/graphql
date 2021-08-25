export const isObject = (obj: any): obj is Record<string, any> =>
  typeof obj === 'object' &&
  obj !== null &&
  obj.constructor === Object &&
  Object.prototype.toString.call(obj) === '[object Object]'

export const mergeDeep = (target: Record<string, any>, source: Record<string, any>) => {
  Object.keys(source).forEach(key => {
    const targetValue = target[key]
    const sourceValue = source[key]

    if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = mergeDeep({ ...targetValue }, sourceValue)
    } else {
      target[key] = sourceValue
    }
  })
  return target
}
