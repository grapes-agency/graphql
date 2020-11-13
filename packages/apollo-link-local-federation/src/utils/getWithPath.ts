interface PathObj {
  data: any
  path: string
}

export const getWithPath = (data: Array<Record<string, any>> | Record<string, any>, path: string): PathObj | Array<PathObj> => {
  const get = (d: any, property: string) => {
    if (typeof d !== 'object' || d === null) {
      return null
    }
    return d[property]
  }

  let current: any = { data, path: '' }

  for (const segment of path.split('.')) {
    if (Array.isArray(current.data)) {
      current = current.data.map((c: any, i: number) => ({
        data: get(c, segment),
        path: `${current.path}[${i}].${segment}`,
      }))
    } else {
      current.data = get(current.data, segment)
      current.path = `${current.path}.${segment}`
    }
  }

  if (Array.isArray(current)) {
    return current.map(c => ({ data: c.data, path: c.path.substring(1) }))
  }
  return { data: current.data, path: current.path.substring(1) }
}
