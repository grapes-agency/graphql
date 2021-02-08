interface PathObj {
  data: any
  path: string
}

export const getWithPath = (data: Array<Record<string, any>> | Record<string, any> | null, path: string) => {
  if (Array.isArray(data)) {
    const operationData: Array<PathObj> = []
    data.forEach((subData, index) =>
      operationData.push(
        ...getWithPath(subData, path).map(d => ({
          path: `[${index}].${d.path}`,
          data: d.data,
        }))
      )
    )
    return operationData
  }

  if (!data) {
    return []
  }

  const segments = path.split('.')
  const currentPath: Array<string> = []
  let currentData = data

  const operationData: Array<PathObj> = []
  for (const segment of segments) {
    currentPath.push(segment)
    currentData = currentData[segment]

    if (currentData === null) {
      break
    }

    if (Array.isArray(currentData) && currentPath.length < segments.length) {
      const pathLeft = segments.slice(currentPath.length).join('.')
      currentData.forEach((currentSubData, index) =>
        operationData.push(
          ...getWithPath(currentSubData, pathLeft).map(d => ({
            path: `${currentPath.join('.')}[${index}].${d.path}`,
            data: d.data,
          }))
        )
      )
      break
    }
  }

  if (currentPath.length === segments.length) {
    operationData.push({
      path,
      data: currentData,
    })
  }

  return operationData
}
