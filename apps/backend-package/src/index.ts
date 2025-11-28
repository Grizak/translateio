import { languageNames } from "@translateio/shared";
import fs from "fs";
import path from "path";
import express from "express";
import http from "http";
import bcrypt from "bcryptjs";
import type {
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
} from "@/types";

// Middleware
import {
  basicAuthMiddleware,
  tracingMiddleware,
  createRateLimitMiddleware,
  productionBlock,
} from "@/middleware";

// Routes
import {
  registerHealthRoutes,
  registerLanguagesRoutes,
  registerTranslateRoutes,
  registerAsyncRoutes,
  registerDebugRoutes,
  registerReadRoutes,
  registerWriteRoutes,
} from "@/routes";

// Translation
import { createTranslationService } from "@/translation";

// Logger
import logger from "@/utils/logger";

function createTranslateIoBackend(
  options: TranslateIoBackendOptions
): TranslateIoBackendReturn {
  let server: http.Server | undefined;
  let metadata: object[] = [];
  const cache = new Map<string, Record<string, string>>();
  const config: TranslateIoBackendConfig = {
    server: {
      port: options.server.port || 4545,
      auth: {
        username: options.server.auth.username || "admin",
        password: bcrypt.hashSync(options.server.auth.password || "admin", 10),
      },
      rateLimit: {
        enabled: options.server.rateLimit?.enabled !== false,
        windowMs: options.server.rateLimit?.windowMs || 60000,
        maxRequests: options.server.rateLimit?.maxRequests || 100,
        skipPaths: options.server.rateLimit?.skipPaths || ["/health"],
      },
    },
    translations: {
      fromFile: options.translations.fromFile,
      outputDirectory:
        options.translations.outputDirectory || `${process.cwd()}/translations`,
      languages: options.translations.languages,
      defaultLanguage:
        options.translations.defaultLanguage ||
        (options.translations.languages.length > 0
          ? options.translations.languages[0]
          : options.translations.languages[0] || "en"),
      parseTranslationData: options.translations.parseTranslationData,
      parseMetadata: options.translations.parseMetadata || (() => []),
    },
    translationService: {
      url: options.translationService.url,
      headers: options.translationService.headers || {},
      timeout: options.translationService.timeout || 5000,
      method: options.translationService.method || "POST",
      contentType: options.translationService.contentType || "application/json",
      retries: options.translationService.retries || 3,
      payload: options.translationService.payload,
      batchProcessing: options.translationService.batchProcessing,
      batchSize: options.translationService.batchSize || 30,
      postProcessing: options.translationService.postProcessing,
    },
  };

  // Validate output directory
  try {
    fs.accessSync(
      config.translations.outputDirectory,
      fs.constants.W_OK | fs.constants.R_OK
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      logger.error!(
        `Error accessing output directory: ${config.translations.outputDirectory}`,
        error
      );
      throw error;
    }
    fs.mkdirSync(config.translations.outputDirectory, { recursive: true });
  }

  // Validate configuration
  if (
    !config.translations.languages ||
    config.translations.languages.length === 0
  ) {
    throw new Error("No languages specified for translation.");
  }

  if (!config.translations.fromFile) {
    throw new Error("No fromFile specified for translation.");
  }

  if (!fs.existsSync(config.translations.fromFile)) {
    throw new Error("fromFile does not exist.");
  }

  config.translations.languages.forEach((language) => {
    if (!Object.keys(languageNames).includes(language)) {
      throw new Error(
        `Invalid language specified: ${language}. Supported languages are: ${Object.values(
          languageNames
        ).join(", ")}`
      );
    }
  });

  if (
    config.translations.defaultLanguage &&
    !config.translations.languages.includes(config.translations.defaultLanguage)
  ) {
    throw new Error("defaultLanguage must be one of the specified languages.");
  }

  if (!config.translationService.url) {
    throw new Error("No translation service URL specified.");
  }

  if (typeof config.translationService.payload !== "function") {
    throw new Error("No payload function specified for translation service.");
  }

  const testPayload = config.translationService.payload({}, "en", metadata);
  if (!testPayload || typeof testPayload !== "object") {
    throw new Error(
      "The payload function must return an object for the translation service."
    );
  }

  // Prepare cache directory and load any existing caches
  const cacheDir = path.join(config.translations.outputDirectory, "cache");
  try {
    fs.accessSync(cacheDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      logger.error!("Error accessing cache directory:", err);
    }
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Load per-language caches into in-memory map
  for (const language of config.translations.languages) {
    const cachePath = path.join(cacheDir, `${language}.json`);
    if (fs.existsSync(cachePath)) {
      try {
        const content = fs.readFileSync(cachePath, "utf-8");
        cache.set(language, JSON.parse(content));
      } catch (err: any) {
        logger.error!(`Failed to load cache for ${language}:`, err);
        cache.set(language, {});
      }
    } else {
      cache.set(language, {});
    }
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Middleware
  app.use(tracingMiddleware);

  // Apply rate limiting if enabled
  if (config.server.rateLimit.enabled) {
    const rateLimiter = createRateLimitMiddleware({
      windowMs: config.server.rateLimit.windowMs,
      maxRequests: config.server.rateLimit.maxRequests,
      skip: (req) => config.server.rateLimit.skipPaths.includes(req.path),
    });
    app.use(rateLimiter.middleware);
  }

  // Public endpoint
  app.get("/", (req, res) => res.send("Translate.io Backend is running."));

  // Apply auth middleware to protected routes
  const authMiddleware = basicAuthMiddleware(
    config.server.auth.username,
    config.server.auth.password
  );

  app.use("/languages", authMiddleware);
  app.use("/languageMapping", authMiddleware);
  app.use("/translate", authMiddleware);
  app.use("/debug", authMiddleware);
  app.use("/write", authMiddleware);
  app.use("/read", authMiddleware);

  app.use("/write", productionBlock);
  app.use("/debug", productionBlock);
  app.use("/translate", productionBlock);

  // Load translations and metadata
  let toTranslate: Record<string, string> = {};
  try {
    const data = fs.readFileSync(config.translations.fromFile, "utf-8");
    toTranslate = config.translations.parseTranslationData(data);

    // Parse metadata from the input file
    metadata = config.translations.parseMetadata(data);
    logger.info!(
      `Loaded ${Object.keys(toTranslate).length} translation keys and ${
        metadata.length
      } metadata entries.`
    );
  } catch (error: any) {
    logger.error!("Error loading translations:", error);
    throw error;
  }

  // Register all routes
  registerHealthRoutes(app);
  registerLanguagesRoutes(app, config);
  registerTranslateRoutes(app, config, toTranslate, cache, cacheDir, metadata);
  registerAsyncRoutes(app, config, cache, cacheDir, metadata);
  registerDebugRoutes(app, config, cache);
  registerWriteRoutes(app);
  registerReadRoutes(app);

  // Server lifecycle
  const startFn = (port: number) => () => {
    server = app.listen(port, () => {
      logger.info!(`Translate.io Backend is running on port ${port}.`);
    });

    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error!(
          `Port ${port} is already in use. Retrying with next port.`
        );
        startFn(port + 1)();
      } else {
        logger.error!("Error starting server:", error);
        throw error;
      }
    });
  };

  const start = startFn(config.server.port);

  return {
    start,
    stop: () => {
      if (server) {
        server.close(() => {
          logger.info!("Translate.io Backend has been stopped.");
        });
      }
    },
  };
}

export default createTranslateIoBackend;
export { createTranslationService };
export type {
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
};
