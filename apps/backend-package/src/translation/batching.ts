import fs from "fs";
import path from "path";
import type { TranslateIoBackendConfig } from "@/types";
import { createTranslationService } from "./service";
import logger from "@/utils/logger";

export async function translateWithBatching(
  data: Record<string, string>,
  toLanguage: string,
  config: TranslateIoBackendConfig,
  cache: Map<string, Record<string, string>>,
  cacheDir: string,
  metadata: object[] = []
): Promise<Record<string, string>> {
  const service = createTranslationService(config, metadata);
  const results: Record<string, string> = {};

  // Check cache and separate cached vs uncached items
  const uncached: Record<string, string> = {};
  // Use language key directly in the map
  let languageCache = cache.get(toLanguage) || {};
  // Ensure map contains the language object reference
  cache.set(toLanguage, languageCache);

  for (const [key, value] of Object.entries(data)) {
    if (Object.prototype.hasOwnProperty.call(languageCache, key)) {
      results[key] = languageCache[key];
    } else {
      uncached[key] = value;
    }
  }

  if (Object.keys(uncached).length === 0) {
    // All items were cached
    return results;
  }

  // Helper to persist language cache to file
  const persistCache = async () => {
    try {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(cacheDir, `${toLanguage}.json`),
        JSON.stringify(languageCache, null, 2),
        "utf-8"
      );
    } catch (err: any) {
      logger.error!("Failed to persist cache:", err);
    }
  };

  if (config.translationService.batchProcessing) {
    // --- Batch processing ---
    const entries = Object.entries(uncached);

    for (
      let i = 0;
      i < entries.length;
      i += config.translationService.batchSize
    ) {
      const batch = entries.slice(i, i + config.translationService.batchSize);

      // Prepare payload as array of objects
      const batchData = batch.map(([key, value]) => ({ key, value }));

      // Handle partial failures within batch
      let response: Record<string, string> = {};
      let retryCount = 0;
      const maxRetries = config.translationService.retries || 3;

      // Attempt batch translation with retries
      while (retryCount < maxRetries) {
        try {
          response = await service.translate(batchData, toLanguage);
          break; // Success, exit retry loop
        } catch (error: any) {
          retryCount++;
          if (retryCount >= maxRetries) {
            // Failed all retries for batch - fallback to per-item translation
            logger.warn!(
              `Batch translation failed after ${maxRetries} retries. Falling back to individual item translation.`
            );

            // Try translating each item individually
            for (const [key, value] of batch) {
              try {
                const itemResponse = await service.translate(
                  { [key]: value },
                  toLanguage
                );
                Object.assign(response, itemResponse);
              } catch (itemError: any) {
                // Log individual item failure but continue
                logger.error!(
                  `Failed to translate item "${key}": ${itemError.message}`
                );
                // Skip this item - don't include in results or cache
              }
            }
            break;
          }
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          logger.warn!(
            `Batch translation attempt ${retryCount} failed. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // Update results and cache with successfully translated items
      Object.assign(results, response);
      Object.assign(languageCache, response);

      // Persist after each batch to reduce lost work on crash
      await persistCache();
    }

    return results;
  } else {
    // --- Singular processing ---
    for (const [key, value] of Object.entries(uncached)) {
      const response = await service.translate({ [key]: value }, toLanguage);
      Object.assign(results, response);
      Object.assign(languageCache, response);

      // Persist after each single translation
      await persistCache();
    }

    return results;
  }
}

// Cached variant of translateWithBatching (for async processing)
export async function translateWithBatchingAndCache(
  data: Record<string, string>,
  toLanguage: string,
  config: TranslateIoBackendConfig,
  cache: Map<string, Record<string, string>>,
  cacheDir: string,
  metadata: object[] = []
): Promise<Record<string, string>> {
  const service = createTranslationService(config, metadata);

  const results: Record<string, string> = {};

  // Ensure language cache object exists
  let languageCache = cache.get(toLanguage);
  if (!languageCache) {
    languageCache = {};
    cache.set(toLanguage, languageCache);
  }

  // Separate cached vs uncached entries
  const uncached: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Object.prototype.hasOwnProperty.call(languageCache, key)) {
      results[key] = languageCache[key];
    } else {
      uncached[key] = value;
    }
  }

  // If nothing to translate, return cached results
  if (Object.keys(uncached).length === 0) {
    return results;
  }

  // Helper to persist language cache to file
  const persistCache = async () => {
    try {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(cacheDir, `${toLanguage}.json`),
        JSON.stringify(languageCache, null, 2),
        "utf-8"
      );
    } catch (err: any) {
      logger.error!("Failed to persist cache:", err);
    }
  };

  if (config.translationService.batchProcessing) {
    const entries = Object.entries(uncached);

    for (
      let i = 0;
      i < entries.length;
      i += config.translationService.batchSize
    ) {
      const batch = entries.slice(i, i + config.translationService.batchSize);

      const batchData = batch.map(([key, value]) => ({ key, value }));

      // Handle partial failures within batch
      let response: Record<string, string> = {};
      let retryCount = 0;
      const maxRetries = config.translationService.retries || 3;

      // Attempt batch translation with retries
      while (retryCount < maxRetries) {
        try {
          response = await service.translate(batchData, toLanguage);
          break; // Success, exit retry loop
        } catch (error: any) {
          retryCount++;
          if (retryCount >= maxRetries) {
            // Failed all retries for batch - fallback to per-item translation
            logger.warn!(
              `Batch translation failed after ${maxRetries} retries. Falling back to individual item translation.`
            );

            // Try translating each item individually
            for (const [key, value] of batch) {
              try {
                const itemResponse = await service.translate(
                  { [key]: value },
                  toLanguage
                );
                Object.assign(response, itemResponse);
              } catch (itemError: any) {
                // Log individual item failure but continue
                logger.error!(
                  `Failed to translate item "${key}": ${itemError.message}`
                );
                // Skip this item - don't include in results or cache
              }
            }
            break;
          }
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          logger.warn!(
            `Batch translation attempt ${retryCount} failed. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      Object.assign(results, response);

      // Update cache with new translations
      Object.assign(languageCache, response);

      // Persist after each batch to reduce lost work on crash
      await persistCache();
    }

    return results;
  } else {
    for (const [key, value] of Object.entries(uncached)) {
      const response = await service.translate({ [key]: value }, toLanguage);
      Object.assign(results, response);

      Object.assign(languageCache, response);

      // Persist after each single translation
      await persistCache();
    }

    return results;
  }
}
