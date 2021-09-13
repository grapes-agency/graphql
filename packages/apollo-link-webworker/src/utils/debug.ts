let activeMode = false

export const debug = (mode?: boolean) => {
  if (typeof mode === 'boolean') {
    activeMode = mode
  }
  return activeMode
}
