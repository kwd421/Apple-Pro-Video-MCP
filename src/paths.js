import { homedir } from 'node:os';
import { isAbsolute, normalize, resolve } from 'node:path';

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

export function assertPlainObject(value, label = 'arguments') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError(`${label} must be an object.`);
  }
  return value;
}

export function expandUserPath(value, label = 'path') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InputError(`${label} must be a non-empty string.`);
  }
  if (value.includes('\0')) {
    throw new InputError(`${label} must not contain a NUL byte.`);
  }

  const expanded = value === '~'
    ? homedir()
    : value.startsWith('~/')
      ? resolve(homedir(), value.slice(2))
      : value;

  if (!isAbsolute(expanded)) {
    throw new InputError(`${label} must be an absolute path or start with ~/.`);
  }

  return normalize(expanded);
}

export function numberInRange(value, label, { min, max, integer = false }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${label} must be a finite number.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new InputError(`${label} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new InputError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

export function optionalBoolean(value, label, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new InputError(`${label} must be true or false.`);
  }
  return value;
}
