import type { TranslateIoBackendConfig } from "@/types";
import {
  asyncRequests,
  broadcastSSEEvent,
  translationQueue,
  setProcessingQueue,
} from "./sse";
import { translateWithBatchingAndCache } from "@/translation";
import logger from "@/utils/logger";

export async function processAsyncTranslationQueue(
  config: TranslateIoBackendConfig,
  cache: Map<string, Record<string, string>>,
  cacheDir: string,
  metadata: object[]
) {
  // Prevent concurrent processing
  setProcessingQueue(true);

  while (translationQueue.length > 0) {
    const requestId = translationQueue.shift();
    if (!requestId) break;

    const request = asyncRequests.get(requestId);
    if (!request) continue;

    try {
      // Notify clients that processing has started
      broadcastSSEEvent({
        type: "start",
        requestId,
        data: { status: "processing", message: "Translation started" },
        timestamp: new Date().toISOString(),
      });

      request.status = "processing";

      // Perform translation with caching
      const result = await translateWithBatchingAndCache(
        request.data,
        request.targetLanguage,
        config,
        cache,
        cacheDir,
        metadata
      );

      request.result = result;
      request.status = "completed";
      request.completedAt = new Date();

      // Notify clients of completion
      broadcastSSEEvent({
        type: "complete",
        requestId,
        data: { status: "completed", result },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      request.error = error.message || "Translation failed";
      request.status = "failed";
      request.completedAt = new Date();

      logger.error!(`Async translation ${requestId} failed:`, error);

      broadcastSSEEvent({
        type: "error",
        requestId,
        data: { status: "failed", error: request.error },
        timestamp: new Date().toISOString(),
      });
    }
  }

  setProcessingQueue(false);
}
