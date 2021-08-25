export const isObject = (obj: any): obj is Record<string, any> => obj && typeof obj === 'object' && !Array.isArray(obj)

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
