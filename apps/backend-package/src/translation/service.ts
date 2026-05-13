import axios from "axios";
import type { TranslateIoBackendConfig, TranslationService } from "@/types";

export function createTranslationService(
  config: TranslateIoBackendConfig,
): TranslationService {
  return {
    translate: async (
      entries: { key: string; content: string }[],
      targetLanguage: string,
    ): Promise<{ key: string; content: string }[]> => {
      try {
        const payload = config.translationService.batchProcessing
          ? config.translationService.payload(entries, targetLanguage)
          : config.translationService.payload(entries[0], targetLanguage);

        const response = await axios({
          url: config.translationService.url,
          method: config.translationService.method,
          headers: config.translationService.headers,
          timeout: config.translationService.timeout,
          data: payload,
        });

        return config.translationService.postProcessing(response.data);
      } catch (error: any) {
        throw new Error(
          `Translation request failed: ${error.message ?? error.toString()}`,
        );
      }
    },
  };
}
