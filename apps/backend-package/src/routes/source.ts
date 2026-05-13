import express from "express";
import type {
  TranslateIoBackendConfig,
  SourceFile,
  SourceEntry,
} from "@/types";
import { markChangedEntries } from "@/translation";
import logger from "@/utils/logger";
import fs from "fs";
import path from "path";

export function registerSourceRoutes(
  app: express.Application,
  config: TranslateIoBackendConfig,
  source: SourceFile,
  persistSource: () => Promise<void>,
) {
  const outputDir = path.join(
    config.translations.outputDirectory,
    "translated",
  );

  // GET /source — list all source keys and their content
  app.get("/source", (req, res) => {
    res.json({ keys: Object.keys(source).length, source });
  });

  // GET /source/:key — get a single source entry
  app.get("/source/:key", (req, res) => {
    const { key } = req.params;
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return res
        .status(404)
        .json({ error: `Key "${key}" not found in source.` });
    }
    res.json({ key, ...source[key] });
  });

  // POST /source/:key — add a new source key
  app.post("/source/:key", async (req, res) => {
    const { key } = req.params;
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json({
          error: "Request body must include a non-empty `content` string.",
        });
    }

    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return res 
        .status(409)
        .json({ error: `Key "${key}" already exists. Use PUT to update it.` });
    }

    source[key] = { content };

    try {
      await persistSource();
      logger.info!(`Source key "${key}" added.`);
      res.status(201).json({ key, content });
    } catch (error: any) {
      // Roll back in-memory change on disk failure
      delete source[key];
      logger.error!(`Failed to persist source after adding "${key}":`, error);
      res
        .status(500)
        .json({ error: "Failed to save source file.", details: error.message });
    }
  });

  // PUT /source/:key — update an existing source key's content
  // Also marks the key as changed in all output files so it gets re-translated
  app.put("/source/:key", async (req, res) => {
    const { key } = req.params;
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json({
          error: "Request body must include a non-empty `content` string.",
        });
    }

    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return res
        .status(404)
        .json({
          error: `Key "${key}" not found in source. Use POST to create it.`,
        });
    }

    const previous = source[key].content;
    source[key] = { content };

    try {
      await persistSource();

      // Mark this key as changed in all existing output files
      for (const lang of config.translations.languages) {
        const outputPath = path.join(outputDir, `${lang}.json`);
        try {
          const raw = await fs.promises.readFile(outputPath, "utf-8");
          const output = JSON.parse(raw);
          if (output[key]) {
            output[key] = {
              ...output[key],
              metadata: { ...output[key].metadata, changed: true },
            };
            await fs.promises.writeFile(
              outputPath,
              JSON.stringify(output, null, 2),
              "utf-8",
            );
          }
        } catch {
          // Output file may not exist yet — that's fine
        }
      }

      logger.info!(`Source key "${key}" updated.`);
      res.json({ key, content, previous });
    } catch (error: any) {
      // Roll back in-memory change on disk failure
      source[key] = { content: previous };
      logger.error!(`Failed to persist source after updating "${key}":`, error);
      res
        .status(500)
        .json({ error: "Failed to save source file.", details: error.message });
    }
  });

  // DELETE /source/:key — remove a source key and clean it from all output files
  app.delete("/source/:key", async (req, res) => {
    const { key } = req.params;

    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return res
        .status(404)
        .json({ error: `Key "${key}" not found in source.` });
    }

    const removed = source[key];
    delete source[key];

    try {
      await persistSource();

      // Remove the key from all output files too
      for (const lang of config.translations.languages) {
        const outputPath = path.join(outputDir, `${lang}.json`);
        try {
          const raw = await fs.promises.readFile(outputPath, "utf-8");
          const output = JSON.parse(raw);
          if (Object.prototype.hasOwnProperty.call(output, key)) {
            delete output[key];
            await fs.promises.writeFile(
              outputPath,
              JSON.stringify(output, null, 2),
              "utf-8",
            );
          }
        } catch {
          // Output file may not exist yet — that's fine
        }
      }

      logger.info!(`Source key "${key}" deleted.`);
      res.json({ ok: true, key, removed });
    } catch (error: any) {
      // Roll back in-memory change on disk failure
      source[key] = removed;
      logger.error!(`Failed to persist source after deleting "${key}":`, error);
      res
        .status(500)
        .json({ error: "Failed to save source file.", details: error.message });
    }
  });
}
