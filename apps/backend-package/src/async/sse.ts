import express from "express";
import type { AsyncTranslationRequest, SSEEvent } from "@/types";
import logger from "@/utils/logger";

// In-memory store for async requests and their SSE connections
export const asyncRequests = new Map<string, AsyncTranslationRequest>();
export const sseConnections = new Map<string, express.Response[]>();

// Queue for processing async translation requests
export const translationQueue: string[] = [];
export let processingQueue = false;

export const setProcessingQueue = (value: boolean) => {
  processingQueue = value;
};

// Helper to send SSE event to all connected clients for a request
export const broadcastSSEEvent = (event: SSEEvent) => {
  const connections = sseConnections.get(event.requestId);
  if (!connections) return;

  const message = `data: ${JSON.stringify(event)}\n\n`;
  connections.forEach((res) => {
    try {
      res.write(message);
    } catch (err) {
      logger.error!("Error sending SSE event:", err);
    }
  });
};
