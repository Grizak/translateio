import fs from "fs";
import path from "path";
import type {
  TranslateIoBackendConfig,
  SourceFile,
  OutputFile,
  OutputEntry,
  TranslationMetadata,
} from "@/types";
import { createTranslationService } from "./service";
import logger from "@/utils/logger";

// Default metadata for a freshly translated entry
function freshMetadata(): TranslationMetadata {
  return {
    translated: true,
    userChanged: false,
    changed: false,
    lastTranslated: new Date().toISOString(),
  };
}

// Load an existing output file from disk, or return an empty object
async function loadOutputFile(filePath: string): Promise<OutputFile> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as OutputFile;
  } catch {
    return {};
  }
}

// Persist an output file to disk
async function persistOutputFile(
  filePath: string,
  output: OutputFile,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(output, null, 2),
    "utf-8",
  );
}

export async function translateWithBatching(
  source: SourceFile,
  toLanguage: string,
  config: TranslateIoBackendConfig,
  outputDir: string,
): Promise<OutputFile> {
  const service = createTranslationService(config);
  const outputPath = path.join(outputDir, `${toLanguage}.json`);

  // Load existing output so we can preserve userChanged entries and metadata
  const existing = await loadOutputFile(outputPath);

  // Separate entries into: skip (userChanged), already up-to-date, and needs translation
  const toTranslate: { key: string; content: string }[] = [];
  const result: OutputFile = {};

  for (const [key, { content }] of Object.entries(source)) {
    const existingEntry = existing[key];

    // Preserve user-edited entries as-is
    if (existingEntry?.metadata?.userChanged) {
      result[key] = existingEntry;
      continue;
    }

    // Skip if already translated and content hasn't changed
    if (
      existingEntry &&
      !existingEntry.metadata.changed &&
      existingEntry.metadata.translated
    ) {
      result[key] = existingEntry;
      continue;
    }

    toTranslate.push({ key, content });
  }

  if (toTranslate.length === 0) {
    return result;
  }

  const maxRetries = config.translationService.retries;

  const translateBatch = async (
    batch: { key: string; content: string }[],
  ): Promise<void> => {
    let retryCount = 0;
    let translated: { key: string; content: string }[] = [];

    while (retryCount < maxRetries) {
      try {
        translated = await service.translate(batch, toLanguage);
        break;
      } catch (error: any) {
        retryCount++;
        if (retryCount >= maxRetries) {
          if (batch.length === 1) {
            // Single item failed all retries — log and skip
            logger.error!(
              `Failed to translate key "${batch[0].key}" after ${maxRetries} retries. Skipping.`,
            );
            return;
          }

          // Batch failed — fall back to per-item translation
          logger.warn!(
            `Batch translation failed after ${maxRetries} retries. Falling back to per-item translation.`,
          );
          for (const item of batch) {
            await translateBatch([item]);
          }
          return;
        }

        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        logger.warn!(
          `Batch attempt ${retryCount} failed. Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Merge translated entries into result
    for (const { key, content } of translated) {
      result[key] = { content, metadata: freshMetadata() };
    }

    // Persist after each batch so a crash mid-run loses minimal work
    await persistOutputFile(outputPath, { ...existing, ...result });
  };

  if (config.translationService.batchProcessing) {
    const batchSize = config.translationService.batchSize;
    for (let i = 0; i < toTranslate.length; i += batchSize) {
      await translateBatch(toTranslate.slice(i, i + batchSize));
    }
  } else {
    for (const item of toTranslate) {
      await translateBatch([item]);
    }
  }

  return result;
}

// Mark existing output entries as changed when source content is updated
export function markChangedEntries(
  source: SourceFile,
  existing: OutputFile,
): OutputFile {
  const updated: OutputFile = { ...existing };

  for (const [key, { content }] of Object.entries(source)) {
    const entry = existing[key];
    if (entry && entry.content !== content && !entry.metadata.userChanged) {
      updated[key] = {
        ...entry,
        metadata: { ...entry.metadata, changed: true },
      };
    }
  }

  // Remove keys from output that no longer exist in source
  for (const key of Object.keys(existing)) {
    if (!source[key]) {
      delete updated[key];
    }
  }

  return updated;
}
