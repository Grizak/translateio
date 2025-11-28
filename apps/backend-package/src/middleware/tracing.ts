import crypto from "crypto";
import express from "express";
import logger from "@/utils/logger";

export let debugVerbose = false;

export const setDebugVerbose = (verbose: boolean) => {
  debugVerbose = verbose;
};

export const tracingMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const reqId = crypto.randomUUID();
  (req as any).requestId = reqId;
  res.setHeader("X-Request-Id", reqId);

  const start = Date.now();
  if (debugVerbose) {
    logger.info!(`[${reqId}] Incoming ${req.method} ${req.originalUrl}`);
    if (Object.keys(req.body || {}).length > 0) {
      logger.info!(`[${reqId}] Body: ${JSON.stringify(req.body)}`);
    }
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info!(
      `[${reqId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
    );
  });

  next();
};
