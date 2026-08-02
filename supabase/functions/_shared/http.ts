/**
 * HTTP utilities for edge functions — production hardened.
 *
 * Includes:
 *  - CORS handling
 *  - Security headers (HSTS, CSP, X-Frame-Options, etc.)
 *  - In-memory sliding-window rate limiting
 *  - Request body size validation
 *  - Structured error responses
 */

const MAX_BODY_SIZE = 16 * 1024; // 16 KB

// ---------------------------------------------------------------- CORS

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------- Security headers

const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

function allHeaders(): Record<string, string> {
  return { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' };
}

// ---------------------------------------------------------------- Response helpers

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: allHeaders(),
  });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

// ---------------------------------------------------------------- Rate limiting
// In-memory sliding window. Resets when the edge function cold-starts.
// For distributed rate limiting, use the `rate_limit_entries` table.

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if a request should be rate-limited.
 *
 * @param key - Unique identifier (e.g., student ID, IP address)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Sliding window duration in milliseconds
 * @returns true if the request is allowed, false if rate-limited
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    return false; // Rate limited
  }

  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);

  // Periodic cleanup: remove stale entries every 100 checks
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore) {
      if (v.timestamps.length === 0 || now - v.timestamps[v.timestamps.length - 1] > windowMs * 2) {
        rateLimitStore.delete(k);
      }
    }
  }

  return true;
}

/**
 * Extract client IP from request headers.
 * Supabase edge functions set x-forwarded-for.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

// ---------------------------------------------------------------- Request validation

/**
 * Validates that the request body is within size limits.
 * Returns the parsed body or throws.
 */
export async function parseAndValidateBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }

  const text = await req.text();
  if (text.length > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON in request body');
  }
}

// ---------------------------------------------------------------- Handler wrapper

/**
 * Wraps an edge function handler with:
 *  - CORS preflight handling
 *  - Method enforcement (POST only)
 *  - Security headers on all responses
 *  - Structured error handling with no stack trace leaking
 *  - Request IP logging for audit
 */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    if (req.method !== 'POST') return fail('Method not allowed', 405);

    const clientIp = getClientIp(req);

    try {
      return await fn(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      // Log full error server-side for debugging, return sanitised message to client
      console.error(`[${clientIp}] ${message}`, error instanceof Error ? error.stack : '');

      // Don't leak internal details in production
      const safeMessage = message.includes('duplicate key')
        ? 'A record with this information already exists.'
        : message.includes('violates')
          ? 'The operation violates a data constraint.'
          : message;

      return fail(safeMessage, 500);
    }
  };
}
