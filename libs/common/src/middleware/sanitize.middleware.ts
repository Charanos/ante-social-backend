import { NextFunction, Request, Response } from 'express';

function sanitizeScalar(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  // Lightweight XSS hardening for reflected payloads.
  return value.replace(/<\s*\/?\s*script/gi, '');
}

function sanitizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }

  if (!value || typeof value !== 'object') {
    return sanitizeScalar(value);
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    // Prevent basic NoSQL operator injection.
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    result[key] = sanitizeObject(child);
  }

  return result;
}

export function sanitizeRequestMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body) as Request['body'];
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query) as Request['query'];
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params) as Request['params'];
  }

  next();
}
