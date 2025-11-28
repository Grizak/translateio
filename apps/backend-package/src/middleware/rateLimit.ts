import express from "express";
import logger from "@/utils/logger";

/**
 * Rate limit store: Maps client identifier to request timestamps
 */
interface RateLimitStore {
  [key: string]: number[]; // Array of request timestamps
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds (e.g., 60000 for 1 minute)
  maxRequests: number; // Max requests per window per client
  message?: string; // Custom error message
  keyGenerator?: (req: express.Request) => string; // Custom key generator (default: IP address)
  skip?: (req: express.Request) => boolean; // Skip rate limiting for certain requests
}

/**
 * Create a rate limiting middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const store: RateLimitStore = {};
  const defaultMessage =
    config.message ||
    `Too many requests. Max ${config.maxRequests} requests per ${config.windowMs / 1000}s.`;
  const keyGenerator = config.keyGenerator || ((req) => getClientIp(req));
  const skip = config.skip || (() => false);

  // Cleanup old timestamps periodically (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const key in store) {
      store[key] = store[key].filter((time) => now - time < config.windowMs);
      if (store[key].length === 0) {
        delete store[key];
      }
    }
  }, 5 * 60 * 1000);

  return {
    middleware: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Initialize store for this key if needed
      if (!store[key]) {
        store[key] = [];
      }

      // Remove old requests outside the window
      store[key] = store[key].filter((time) => time > windowStart);

      // Check if limit exceeded
      if (store[key].length >= config.maxRequests) {
        logger.warn!(`Rate limit exceeded for ${key}`);
        return res.status(429).json({
          error: defaultMessage,
          retryAfter: Math.ceil(
            (Math.min(...store[key]) + config.windowMs - now) / 1000
          ),
        });
      }

      // Record this request
      store[key].push(now);

      // Add rate limit info headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", (config.maxRequests - store[key].length).toString());
      res.setHeader(
        "X-RateLimit-Reset",
        new Date(Math.max(...store[key]) + config.windowMs).toISOString()
      );

      next();
    },
    cleanup: () => clearInterval(cleanupInterval),
    reset: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
  };
}

/**
 * Extract client IP from request
 */
function getClientIp(req: express.Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    (req.socket.remoteAddress as string) ||
    "unknown"
  );
}
