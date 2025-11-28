import express from "express";
import type { TranslateIoBackendConfig } from "@/types";
import { asyncRequests, sseConnections, translationQueue } from "@/async";
import { setDebugVerbose } from "@/middleware/tracing";

export const registerDebugRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
  cache: Map<string, Record<string, string>>
) => {
  app.get("/debug/state", (req, res) => {
    const cacheSummary = Array.from(cache.entries()).map(([lang, obj]) => ({
      lang,
      keys: Object.keys(obj || {}).length,
    }));

    const statusCounts: Record<string, number> = {};
    for (const r of asyncRequests.values()) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    res.json({
      languages: config.translations.languages,
      queueLength: translationQueue.length,
      asyncRequestCount: asyncRequests.size,
      asyncStatusCounts: statusCounts,
      cacheSummary,
      sseConnections: Array.from(sseConnections.entries()).map(
        ([id, conns]) => ({ id, connections: conns.length })
      ),
    });
  });

  app.get("/debug/cache/:lang", (req, res) => {
    const { lang } = req.params;
    const c = cache.get(lang);
    if (!c) return res.status(404).json({ error: "No cache for language" });
    res.json(c);
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
