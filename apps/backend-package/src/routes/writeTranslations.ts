import fs from "fs";
import path from "path";
import express from "express";
import type { TranslateIoBackendConfig } from "@/types";
import logger from "@/utils/logger";

export function registerWriteRoutes(
  app: express.Application,
  config?: TranslateIoBackendConfig,
) {
  // PUT /write/:lang - Write (or overwrite) a full translation file for a language
  app.put("/write/:lang", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const { lang } = req.params;

    if (!config.translations.languages.includes(lang)) {
      return res.status(400).json({ error: `Unsupported language: ${lang}` });
    }

    const translations = req.body;

    if (
      !translations ||
      typeof translations !== "object" ||
      Array.isArray(translations)
    ) {
      return res
        .status(400)
        .json({
          error:
            "Request body must be a flat JSON object of translation key-value pairs.",
        });
    }

    const outputDir = path.join(
      config.translations.outputDirectory,
      "translated",
    );

    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `${lang}.json`);
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(translations, null, 2),
        "utf-8",
      );
      logger.info!(`Translations for ${lang} written to ${outputPath}`);
      res.json({ ok: true, lang, keys: Object.keys(translations).length });
    } catch (error: any) {
      logger.error!(`Failed to write translations for ${lang}:`, error);
      res
        .status(500)
        .json({
          error: "Failed to write translation file.",
          details: error.message,
        });
    }
  });

  // PATCH /write/:lang - Merge new key-value pairs into an existing translation file
  app.patch("/write/:lang", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const { lang } = req.params;

    if (!config.translations.languages.includes(lang)) {
      return res.status(400).json({ error: `Unsupported language: ${lang}` });
    }

    const updates = req.body;

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res
        .status(400)
        .json({
          error:
            "Request body must be a flat JSON object of translation key-value pairs.",
        });
    }

    const outputDir = path.join(
      config.translations.outputDirectory,
      "translated",
    );
    const outputPath = path.join(outputDir, `${lang}.json`);

    try {
      await fs.promises.mkdir(outputDir, { recursive: true });

      let existing: Record<string, string> = {};
      try {
        const raw = await fs.promises.readFile(outputPath, "utf-8");
        existing = JSON.parse(raw);
      } catch {
        // File doesn't exist yet — start fresh
      }

      const merged = { ...existing, ...updates };
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(merged, null, 2),
        "utf-8",
      );
      logger.info!(
        `Merged ${Object.keys(updates).length} key(s) into ${lang} translations.`,
      );
      res.json({
        ok: true,
        lang,
        updated: Object.keys(updates).length,
        total: Object.keys(merged).length,
      });
    } catch (error: any) {
      logger.error!(`Failed to merge translations for ${lang}:`, error);
      res
        .status(500)
        .json({
          error: "Failed to merge translation file.",
          details: error.message,
        });
    }
  });

  // DELETE /write/:lang/:key - Remove a single key from a translation file
  app.delete("/write/:lang/:key", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const { lang, key } = req.params;

    if (!config.translations.languages.includes(lang)) {
      return res.status(400).json({ error: `Unsupported language: ${lang}` });
    }

    const outputPath = path.join(
      config.translations.outputDirectory,
      "translated",
      `${lang}.json`,
    );

    try {
      const raw = await fs.promises.readFile(outputPath, "utf-8");
      const translations: Record<string, string> = JSON.parse(raw);

      if (!Object.prototype.hasOwnProperty.call(translations, key)) {
        return res
          .status(404)
          .json({ error: `Key "${key}" not found in ${lang} translations.` });
      }

      delete translations[key];
      await fs.promises.writeFile(
        outputPath,
        JSON.stringify(translations, null, 2),
        "utf-8",
      );
      logger.info!(`Deleted key "${key}" from ${lang} translations.`);
      res.json({ ok: true, lang, deleted: key });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return res
          .status(404)
          .json({ error: `No translation file found for language: ${lang}` });
      }
      logger.error!(`Failed to delete key "${key}" from ${lang}:`, error);
      res
        .status(500)
        .json({
          error: "Failed to update translation file.",
          details: error.message,
        });
    }
  });
}
