import argon2 from 'argon2'

export const MIN_PASSWORD_LENGTH = 10

export function hashPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('password_too_short')
  }

  return argon2.hash(password)
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}
