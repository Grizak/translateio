import crypto from "crypto";
import path from "path";
import express from "express";
import type {
  TranslateIoBackendConfig,
  SourceFile,
  AsyncTranslationRequest,
} from "@/types";
import { asyncRequests, sseConnections, translationQueue } from "@/async";
import { processAsyncTranslationQueue } from "@/async/queue";
import logger from "@/utils/logger";

export const registerAsyncRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
  source: SourceFile,
) => {
  const outputDir = path.join(
    config.translations.outputDirectory,
    "translated",
  );

  // POST /translate/async — queue an async translation job
  app.post("/translate/async", async (req, res) => {
    const { targetLanguage } = req.body;

    if (
      !targetLanguage ||
      !config.translations.languages.includes(targetLanguage)
    ) {
      return res.status(400).json({ error: "Unsupported target language." });
    }

    const requestId = crypto.randomUUID();
    const asyncRequest: AsyncTranslationRequest = {
      id: requestId,
      data: source,
      targetLanguage,
      status: "pending",
      createdAt: new Date(),
    };

    asyncRequests.set(requestId, asyncRequest);
    translationQueue.push(requestId);

    logger.info!(`Queued async translation: ${requestId} → ${targetLanguage}`);

    setImmediate(() => {
      processAsyncTranslationQueue(config, outputDir).catch((err) =>
        logger.error!("Error processing queue:", err),
      );
    });

    res.json({ requestId, status: "pending" });
  });

  // GET /translate/stream/:requestId — SSE stream for live progress
  app.get("/translate/stream/:requestId", (req, res) => {
    const { requestId } = req.params;

    if (!asyncRequests.has(requestId)) {
      return res.status(404).json({ error: "Request not found." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!sseConnections.has(requestId)) {
      sseConnections.set(requestId, []);
    }
    sseConnections.get(requestId)!.push(res);

    // Send current state immediately on connect
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
        })}\n\n`,
      );
    }

    res.on("close", () => {
      const connections = sseConnections.get(requestId);
      if (connections) {
        const index = connections.indexOf(res);
        if (index > -1) connections.splice(index, 1);
        if (connections.length === 0) sseConnections.delete(requestId);
      }
    });

    res.on("error", (err) => {
      logger.error!(`SSE error for ${requestId}:`, err);
      res.end();
    });
  });

  // GET /translate/status/:requestId — poll job status
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
