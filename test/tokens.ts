import { crc32 } from 'node:zlib'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * A GitHub token of the checksummed format: its prefix, 30 random characters, and their base62
 * CRC32 in the last 6. Built at run time, so no token-shaped literal sits in the source for a
 * scanner to flag.
 */
export function githubToken(prefix: string, random = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5'): string {
  let sum = ''
  for (let n = crc32(random); n > 0; n = Math.floor(n / 62)) sum = BASE62[n % 62] + sum
  return `${prefix}${random}${sum.padStart(6, '0')}`
}
