import { compareSemver, getLatestSemver } from '~/src/helpers/semver.js'

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns positive when a > b (major)', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('returns negative when a < b (major)', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0)
  })

  it('compares minor versions correctly', () => {
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.9', '1.1.0')).toBeLessThan(0)
  })

  it('compares patch versions correctly', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('handles versions where numeric value differs from lexicographic order', () => {
    // "10" > "9" numerically but "10" < "9" lexicographically
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.10', '1.0.9')).toBeGreaterThan(0)
  })

  it('treats missing parts as 0 when versions have different part counts', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0)
    expect(compareSemver('1.0.0', '1.0')).toBe(0)
    expect(compareSemver('1.1', '1.0.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.9', '1.1')).toBeLessThan(0)
  })
})

describe('getLatestSemver', () => {
  it('returns null for an empty array', () => {
    expect(getLatestSemver([])).toBeNull()
  })

  it('returns the single element for a one-element array', () => {
    expect(getLatestSemver(['1.0.0'])).toBe('1.0.0')
  })

  it('returns the highest semver from an unsorted array', () => {
    expect(getLatestSemver(['1.0.0', '2.0.0', '1.5.3'])).toBe('2.0.0')
  })

  it('handles versions that differ only by patch', () => {
    expect(getLatestSemver(['1.0.1', '1.0.0', '1.0.2'])).toBe('1.0.2')
  })

  it('handles versions that differ only by minor', () => {
    expect(getLatestSemver(['1.1.0', '1.0.0', '1.9.0', '1.10.0'])).toBe('1.10.0')
  })

  it('does not mutate the input array', () => {
    const input = ['2.0.0', '1.0.0']
    getLatestSemver(input)
    expect(input).toEqual(['2.0.0', '1.0.0'])
  })
})
