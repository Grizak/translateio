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
  SourceFile,
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
  registerSourceRoutes,
} from "@/routes";

// Translation
import { createTranslationService } from "@/translation";

// Logger
import logger from "@/utils/logger";

function createTranslateIoBackend(
  options: TranslateIoBackendOptions,
): TranslateIoBackendReturn {
  let server: http.Server | undefined;
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
        options.translations.languages[0],
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

  // ── Validate output directory ──────────────────────────────────────────────
  try {
    fs.accessSync(
      config.translations.outputDirectory,
      fs.constants.W_OK | fs.constants.R_OK,
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      logger.error!(
        `Error accessing output directory: ${config.translations.outputDirectory}`,
        error,
      );
      throw error;
    }
    fs.mkdirSync(config.translations.outputDirectory, { recursive: true });
  }

  // ── Validate config ────────────────────────────────────────────────────────
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
          languageNames,
        ).join(", ")}`,
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

  if (typeof config.translationService.postProcessing !== "function") {
    throw new Error(
      "No postProcessing function specified for translation service.",
    );
  }

  // ── Load source file ───────────────────────────────────────────────────────
  let source: SourceFile = {};
  try {
    const raw = fs.readFileSync(config.translations.fromFile, "utf-8");
    source = JSON.parse(raw) as SourceFile;
    logger.info!(
      `Loaded ${Object.keys(source).length} source keys from ${config.translations.fromFile}`,
    );
  } catch (error: any) {
    logger.error!("Error loading source file:", error);
    throw error;
  }

  // Helper to persist the in-memory source back to fromFile
  const persistSource = async (): Promise<void> => {
    await fs.promises.writeFile(
      config.translations.fromFile,
      JSON.stringify(source, null, 2),
      "utf-8",
    );
  };

  // ── Express setup ──────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(tracingMiddleware);

  if (config.server.rateLimit.enabled) {
    const rateLimiter = createRateLimitMiddleware({
      windowMs: config.server.rateLimit.windowMs,
      maxRequests: config.server.rateLimit.maxRequests,
      skip: (req) => config.server.rateLimit.skipPaths.includes(req.path),
    });
    app.use(rateLimiter.middleware);
  }

  app.get("/", (req, res) => res.send("Translate.io Backend is running."));

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authMiddleware = basicAuthMiddleware(
    config.server.auth.username,
    config.server.auth.password,
  );

  const protectedPaths = [
    "/languages",
    "/languageMapping",
    "/translate",
    "/debug",
    "/write",
    "/read",
    "/source",
  ];
  protectedPaths.forEach((p) => app.use(p, authMiddleware));

  // These routes are blocked in production
  const prodBlockPaths = ["/write", "/debug", "/translate", "/source"];
  prodBlockPaths.forEach((p) => app.use(p, productionBlock));

  // ── Routes ─────────────────────────────────────────────────────────────────
  registerHealthRoutes(app);
  registerLanguagesRoutes(app, config);
  registerTranslateRoutes(app, config, source);
  registerAsyncRoutes(app, config, source);
  registerDebugRoutes(app, config);
  registerWriteRoutes(app, config);
  registerReadRoutes(app, config);
  registerSourceRoutes(app, config, source, persistSource);

  // ── Server lifecycle ───────────────────────────────────────────────────────
  const startFn = (port: number) => () => {
    server = app.listen(port, () => {
      logger.info!(`Translate.io Backend is running on port ${port}.`);
    });

    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error!(
          `Port ${port} is already in use. Retrying with next port.`,
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
