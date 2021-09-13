export const isPlainObject = (obj: any): obj is Record<string, any> =>
  typeof obj === 'object' &&
  obj !== null &&
  obj.constructor === Object &&
  Object.prototype.toString.call(obj) === '[object Object]'
