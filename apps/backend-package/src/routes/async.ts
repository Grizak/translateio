import crypto from "crypto";
import express from "express";
import type {
  TranslateIoBackendConfig,
  AsyncTranslationRequest,
} from "@/types";
import { asyncRequests, sseConnections, translationQueue } from "@/async";
import { processAsyncTranslationQueue } from "@/async/queue";
import logger from "@/utils/logger";

export const registerAsyncRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
  cache: Map<string, Record<string, string>>,
  cacheDir: string,
  metadata: object[]
) => {
  // POST /translate/async - Queue an async translation with SSE
  app.post("/translate/async", async (req, res) => {
    const { data, targetLanguage } = req.body;

    // Validate input
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data provided." });
    }

    if (
      !targetLanguage ||
      !config.translations.languages.includes(targetLanguage)
    ) {
      return res.status(400).json({ error: "Unsupported target language." });
    }

    // Create async request
    const requestId = crypto.randomUUID();
    const asyncRequest: AsyncTranslationRequest = {
      id: requestId,
      data,
      targetLanguage,
      status: "pending",
      createdAt: new Date(),
    };

    asyncRequests.set(requestId, asyncRequest);
    translationQueue.push(requestId);

    logger.info!(
      `Queued async translation request: ${requestId} for ${targetLanguage}`
    );

    // Start processing in background (non-blocking)
    setImmediate(() => {
      processAsyncTranslationQueue(config, cache, cacheDir, metadata).catch(
        (err) => logger.error!("Error processing queue:", err)
      );
    });

    // Return request ID immediately
    res.json({ requestId, status: "pending" });
  });

  // GET /translate/stream/:requestId - SSE stream for async translation
  app.get("/translate/stream/:requestId", (req, res) => {
    const { requestId } = req.params;

    // Check if request exists
    if (!asyncRequests.has(requestId)) {
      return res.status(404).json({ error: "Request not found." });
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Add this connection to the list
    if (!sseConnections.has(requestId)) {
      sseConnections.set(requestId, []);
    }
    sseConnections.get(requestId)!.push(res);

    // Send initial state
    const request = asyncRequests.get(requestId);
    if (request) {
      res.write(
        `data: ${JSON.stringify({
          type: "state",
          requestId,
          data: {
            status: request.status,
            result: request.result,
            error: request.error,
          },
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    }

    // Handle client disconnect
    res.on("close", () => {
      const connections = sseConnections.get(requestId);
      if (connections) {
        const index = connections.indexOf(res);
        if (index > -1) {
          connections.splice(index, 1);
        }
        // Clean up if no more connections
        if (connections.length === 0) {
          sseConnections.delete(requestId);
        }
      }
    });

    res.on("error", (err) => {
      logger.error!(`SSE error for ${requestId}:`, err);
      res.end();
    });
  });

  // GET /translate/status/:requestId - Check async translation status
  app.get("/translate/status/:requestId", (req, res) => {
    const { requestId } = req.params;

    const request = asyncRequests.get(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found." });
    }

    res.json({
      requestId,
      status: request.status,
      result: request.result,
      error: request.error,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
    });
  });
};
