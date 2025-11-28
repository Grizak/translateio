import fs from "fs";
import axios from "axios";
import type { TranslateIoBackendConfig, TranslationService } from "@/types";

export function createTranslationService(
  config: TranslateIoBackendConfig,
  metadata: object[] = []
): TranslationService {
  return {
    translate: async (
      translations: Record<string, string> | Record<string, string>[],
      targetLanguage: string
    ): Promise<Record<string, string>> => {
      try {
        // Normalize input to array of records
        const inputArray = Array.isArray(translations)
          ? translations
          : [translations];

        // Build payload through user-defined payload fn
        const payload = config.translationService.payload(
          inputArray,
          targetLanguage,
          metadata
        );

        const response = await axios({
          url: config.translationService.url,
          method: config.translationService.method,
          headers: config.translationService.headers,
          timeout: config.translationService.timeout,
          data: payload,
        });

        // Ensure postProcessing returns proper structure
        const processed = config.translationService.postProcessing(
          response.data
        );

        // Convert array of { key, value } → Record<string, string>
        return processed.reduce<Record<string, string>>(
          (acc, { key, value }) => {
            acc[key] = value;
            return acc;
          },
          {}
        );
      } catch (error: any) {
        throw new Error(
          `Translation request failed: ${error.message ?? error.toString()}`
        );
      }
    },

    getMetadata: async (language: string): Promise<object[]> => {
      const metadata = await fs.promises.readFile(
        `${config.translations.outputDirectory}/metadata/${language}.json`,
        "utf-8"
      );
      return JSON.parse(metadata);
    },

    setMetadata: async (
      language: string,
      metadata: object[]
    ): Promise<void> => {
      await fs.promises.writeFile(
        `${config.translations.outputDirectory}/metadata/${language}.json`,
        JSON.stringify(metadata, null, 2)
      );
    },
  };
}
