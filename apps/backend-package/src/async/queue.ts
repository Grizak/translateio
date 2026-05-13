import type { TranslateIoBackendConfig } from "@/types";
import {
  asyncRequests,
  broadcastSSEEvent,
  translationQueue,
  setProcessingQueue,
  processingQueue,
} from "./sse";
import { translateWithBatching } from "@/translation";
import logger from "@/utils/logger";

export async function processAsyncTranslationQueue(
  config: TranslateIoBackendConfig,
  outputDir: string,
) {
  if (processingQueue) return;
  setProcessingQueue(true);

  while (translationQueue.length > 0) {
    const requestId = translationQueue.shift();
    if (!requestId) break;

    const request = asyncRequests.get(requestId);
    if (!request) continue;

    try {
      broadcastSSEEvent({
        type: "start",
        requestId,
        data: { status: "processing", message: "Translation started" },
        timestamp: new Date().toISOString(),
      });

      request.status = "processing";

      const result = await translateWithBatching(
        request.data,
        request.targetLanguage,
        config,
        outputDir,
      );

      request.result = result;
      request.status = "completed";
      request.completedAt = new Date();

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
