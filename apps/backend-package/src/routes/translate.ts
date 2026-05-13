import fs from "fs";
import path from "path";
import express from "express";
import type { TranslateIoBackendConfig, SourceFile } from "@/types";
import { translateWithBatching } from "@/translation";
import logger from "@/utils/logger";

export const registerTranslateRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig,
  source: SourceFile,
) => {
  const outputDir = path.join(
    config.translations.outputDirectory,
    "translated",
  );

  // POST /translate/:toLang — trigger a translation run for one language
  // Accepts optional ?write=true (default true) to persist the output file
  // FIXME: Long-running — for large source files use the async route instead
  app.post("/translate/:toLang", async (req, res) => {
    const { toLang } = req.params;
    const write = req.query.write !== "false";

    if (!config.translations.languages.includes(toLang)) {
      return res
        .status(400)
        .json({ error: `Unsupported target language: ${toLang}` });
    }

    try {
      const result = await translateWithBatching(
        source,
        toLang,
        config,
        outputDir,
      );

      if (write) {
        await fs.promises.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, `${toLang}.json`);
        await fs.promises.writeFile(
          outputPath,
          JSON.stringify(result, null, 2),
          "utf-8",
        );
        logger.info!(`Translations for ${toLang} written to ${outputPath}`);
      }

      res.json({
        language: toLang,
        keys: Object.keys(result).length,
        translations: result,
      });
    } catch (error: any) {
      logger.error!("Translation error:", error);
      res
        .status(500)
        .json({ error: "Translation failed.", details: error.message });
    }
  });
};
