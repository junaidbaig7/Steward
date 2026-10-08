/** TheMealDB serves resized variants by suffix — use small images for cards. */
export function sizedImage(url, size = 'medium') {
  if (!url) return null
  return url.includes('themealdb.com') ? `${url}/${size}` : url
}
