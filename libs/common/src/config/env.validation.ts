type EnvConfig = Record<string, any>;

const PLACEHOLDER_PATTERNS = [
  /^your-/i,
  /^<.+>$/,
  /change-in-production/i,
  /super-secret/i,
];

function isPlaceholder(value?: string) {
  if (!value) {
    return true;
  }
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function assertStrongSecret(name: string, value?: string) {
  if (!value || value.length < 32 || isPlaceholder(value)) {
    throw new Error(`${name} must be set to a strong non-placeholder value`);
  }
}

export function validateEnv(config: EnvConfig) {
  const env = { ...config };
  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();

  if (!env.NOWPAYMENTS_IPN_SECRET && env.NOWPAYMENTS_IPN_KEY) {
    env.NOWPAYMENTS_IPN_SECRET = env.NOWPAYMENTS_IPN_KEY;
  }

  if (
    env.NOWPAYMENTS_IPN_SECRET &&
    env.NOWPAYMENTS_IPN_KEY &&
    env.NOWPAYMENTS_IPN_SECRET !== env.NOWPAYMENTS_IPN_KEY
  ) {
    throw new Error('NOWPAYMENTS_IPN_SECRET and NOWPAYMENTS_IPN_KEY must match when both are set');
  }

  if (nodeEnv === 'production') {
    const mongoUri = env.MONGODB_URI || env.DATABASE_URL;
    if (!mongoUri) {
      throw new Error('MONGODB_URI or DATABASE_URL is required in production');
    }

    assertStrongSecret('JWT_SECRET', env.JWT_SECRET);
    if (env.JWT_REFRESH_SECRET) {
      assertStrongSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET);
    }
  }

  return env;
}
