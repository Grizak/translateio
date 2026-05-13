import fs from "fs";
import path from "path";
import express from "express";
import type { TranslateIoBackendConfig } from "@/types";
import logger from "@/utils/logger";

export function registerReadRoutes(
  app: express.Application,
  config?: TranslateIoBackendConfig,
) {
  // GET /read - List all languages that have a translation file on disk
  app.get("/read", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const translatedDir = path.join(
      config.translations.outputDirectory,
      "translated",
    );

    try {
      await fs.promises.mkdir(translatedDir, { recursive: true });
      const files = await fs.promises.readdir(translatedDir);
      const languages = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.basename(f, ".json"));

      res.json({ languages });
    } catch (error: any) {
      logger.error!("Failed to list translation files:", error);
      res
        .status(500)
        .json({
          error: "Failed to read translation directory.",
          details: error.message,
        });
    }
  });

  // GET /read/:lang - Read the full translation file for a language
  app.get("/read/:lang", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const { lang } = req.params;

    if (!config.translations.languages.includes(lang)) {
      return res.status(400).json({ error: `Unsupported language: ${lang}` });
    }

    const filePath = path.join(
      config.translations.outputDirectory,
      "translated",
      `${lang}.json`,
    );

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const translations: Record<string, string> = JSON.parse(raw);
      res.json({ lang, translations, keys: Object.keys(translations).length });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return res
          .status(404)
          .json({ error: `No translation file found for language: ${lang}` });
      }
      logger.error!(`Failed to read translations for ${lang}:`, error);
      res
        .status(500)
        .json({
          error: "Failed to read translation file.",
          details: error.message,
        });
    }
  });

  // GET /read/:lang/:key - Read a single translation key for a language
  app.get("/read/:lang/:key", async (req, res) => {
    if (!config) {
      return res
        .status(500)
        .json({ error: "Server configuration unavailable." });
    }

    const { lang, key } = req.params;

    if (!config.translations.languages.includes(lang)) {
      return res.status(400).json({ error: `Unsupported language: ${lang}` });
    }

    const filePath = path.join(
      config.translations.outputDirectory,
      "translated",
      `${lang}.json`,
    );

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const translations: Record<string, string> = JSON.parse(raw);

      if (!Object.prototype.hasOwnProperty.call(translations, key)) {
        return res
          .status(404)
          .json({ error: `Key "${key}" not found in ${lang} translations.` });
      }

      res.json({ lang, key, value: translations[key] });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return res
          .status(404)
          .json({ error: `No translation file found for language: ${lang}` });
      }
      logger.error!(`Failed to read key "${key}" for ${lang}:`, error);
      res
        .status(500)
        .json({
          error: "Failed to read translation file.",
          details: error.message,
        });
    }
  });
}
