import fs from "fs";
import path from "path";
import express from "express";
import type { TranslateIoBackendConfig } from "@/types";
import { createTranslationService, translateWithBatching } from "@/translation";
import logger from "@/utils/logger";

export const registerTranslateRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
  toTranslate: Record<string, string>,
  cache: Map<string, Record<string, string>>,
  cacheDir: string,
  metadata: object[]
) => {
  async function translate(toLang: string) {
    if (!config.translations.languages.includes(toLang)) {
      return Promise.reject(new Error("Unsupported target language."));
    }

    try {
      const translated = await translateWithBatching(
        toTranslate,
        toLang,
        config,
        cache,
        cacheDir,
        metadata
      );

      // Save the metadata for this language
      const service = createTranslationService(config, metadata);
      await service.setMetadata(toLang, metadata);

      return translated;
    } catch (error: any) {
      logger.error!("Translation error:", error);
      throw new Error("Translation failed.");
    }
  }

  // FIXME: Remove before finalizing (request timeout suspected if translating many
  //  translations are made at the same time)
  app.get("/translate/:toLang", async (req, res) => {
    const { toLang } = req.params;
    const { write } = req.query;

    try {
      const translated = await translate(toLang);
      res.json({ translations: translated });
      if (write === "true") {
        // Write translations to file
        const outputDir = path.join(
          config.translations.outputDirectory,
          "translated"
        );
        await fs.promises.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${toLang}.json`);
        await fs.promises.writeFile(
          outputPath,
          JSON.stringify(translated, null, 2),
          "utf-8"
        );
        logger.info!(`Translations for ${toLang} written to ${outputPath}`);
      }
    } catch (error: any) {
      logger.error!("Translation error:", error);
      res
        .status(500)
        .json({ error: "Translation failed.", details: error.message });
    }
  });
};
