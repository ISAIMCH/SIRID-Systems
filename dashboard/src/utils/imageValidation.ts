const allowedBase64ImagePattern = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i

export function isValidImageValue(value: string) {
  const imageValue = value.trim()
  if (!imageValue) return true
  if (allowedBase64ImagePattern.test(imageValue)) return true

  try {
    const url = new URL(imageValue)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
