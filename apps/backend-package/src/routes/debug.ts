import express from "express";
import type { TranslateIoBackendConfig } from "@/types";
import { asyncRequests, sseConnections, translationQueue } from "@/async";
import { setDebugVerbose } from "@/middleware/tracing";

export const registerDebugRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
) => {
  app.get("/debug/state", (req, res) => {
    const statusCounts: Record<string, number> = {};
    for (const r of asyncRequests.values()) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    res.json({
      languages: config.translations.languages,
      queueLength: translationQueue.length,
      asyncRequestCount: asyncRequests.size,
      asyncStatusCounts: statusCounts,
      sseConnections: Array.from(sseConnections.entries()).map(
        ([id, conns]) => ({ id, connections: conns.length }),
      ),
    });
  });

  app.get("/debug/queue", (req, res) => {
    res.json({ queue: [...translationQueue] });
  });

  app.post("/debug/clear-queue", (req, res) => {
    translationQueue.length = 0;
    res.json({ ok: true });
  });

  app.post("/debug/clear-completed-requests", (req, res) => {
    for (const [id, r] of asyncRequests.entries()) {
      if (r.status === "completed" || r.status === "failed") {
        asyncRequests.delete(id);
      }
    }
    res.json({ ok: true });
  });

  app.post("/debug/verbose", (req, res) => {
    const { verbose } = req.body as { verbose?: boolean };
    setDebugVerbose(!!verbose);
    res.json({ verbose: !!verbose });
  });
};
