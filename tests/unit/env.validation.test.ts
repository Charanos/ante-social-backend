import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnv } from '../../libs/common/src/config/env.validation';

test('validateEnv maps NOWPAYMENTS_IPN_KEY to NOWPAYMENTS_IPN_SECRET', () => {
  const env = validateEnv({
    NODE_ENV: 'development',
    NOWPAYMENTS_IPN_KEY: 'abc123',
  });

  assert.equal(env.NOWPAYMENTS_IPN_SECRET, 'abc123');
});

test('validateEnv rejects weak JWT secret in production', () => {
  assert.throws(
    () =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'mongodb://localhost:27017/test',
        JWT_SECRET: 'weak',
      }),
    /JWT_SECRET must be set to a strong non-placeholder value/,
  );
});

test('validateEnv accepts strong JWT secret in production', () => {
  const env = validateEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'mongodb://localhost:27017/test',
    JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    JWT_REFRESH_SECRET: '123456abcdefghijklmnopqrstuvwxyz',
  });

  assert.equal(env.JWT_SECRET, 'abcdefghijklmnopqrstuvwxyz123456');
});
