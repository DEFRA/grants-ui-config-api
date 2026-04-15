/**
 * Compares two semver strings (e.g. "0.0.5" vs "1.0.0").
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareSemver(a, b) {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

/**
 * Returns the latest semver string from an array, or null if the array is empty.
 * @param {string[]} versions
 * @returns {string | null}
 */
export function getLatestSemver(versions) {
  if (!versions.length) {
    return null
  }
  return [...versions].sort(compareSemver).at(-1) ?? null
}
