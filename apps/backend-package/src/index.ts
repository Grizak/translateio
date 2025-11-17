import { languageNames } from "@translateio/shared";
import fs from "fs";
import nodeloggerg from "nodeloggerg";
import express from "express";
import axios from "axios";
import http from "http";
import bcrypt from "bcryptjs";
import type {
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
} from "./types/index.js";

const logger = nodeloggerg({
  serverConfig: {
    startWebServer: false,
  },
  logLevel: "info",
  logFile: "translateio-backend.log",
  compressOldLogs: true,
});

// --- Auth Middleware ---
const basicAuthMiddleware =
  (username: string, hashedPassword: string) =>
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Translate.io"');
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const base64Credentials = auth.split(" ")[1];
      const decoded = Buffer.from(base64Credentials, "base64").toString(
        "utf-8"
      );
      const [inputUser, inputPass] = decoded.split(":");

      const passwordMatch = await bcrypt.compare(inputPass, hashedPassword);

      if (inputUser !== username || !passwordMatch) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Translate.io"');
        return res.status(401).json({ error: "Unauthorized" });
      }

      next();
    } catch (err) {
      return res
        .status(400)
        .json({ error: "Invalid Authorization header format" });
    }
  };

function createTranslationService(
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
        const processed: { key: string; value: string }[] =
          config.translationService.postProcessing(response.data);

        // Convert array of { key, value } → Record<string, string>
        return processed.reduce<Record<string, string>>(
          (acc, { key, value }) => {
            acc[key] = value;
            return acc;
          },
          {}
        );
      } catch (error: any) {
        // Add better error context
        throw new Error(
          `Translation request failed: ${error.message ?? error.toString()}`
        );
      }
    },

    getMetadata: async (language: string): Promise<object[]> => {
      const metadata = await fs.promises.readFile(
        `${config.translations.outputDirectory}/${language}.metadata.json`,
        "utf-8"
      );
      return JSON.parse(metadata);
    },

    setMetadata: async (
      language: string,
      metadata: object[]
    ): Promise<void> => {
      await fs.promises.writeFile(
        `${config.translations.outputDirectory}/${language}.metadata.json`,
        JSON.stringify(metadata, null, 2)
      );
    },
  };
}

async function translateWithBatching(
  data: Record<string, string>,
  toLanguage: string,
  config: TranslateIoBackendConfig,
  metadata: object[] = []
): Promise<Record<string, string>> {
  const service = createTranslationService(config, metadata);

  if (config.translationService.batchProcessing) {
    // --- Batch processing ---
    const entries = Object.entries(data);
    const results: Record<string, string> = {};

    for (
      let i = 0;
      i < entries.length;
      i += config.translationService.batchSize
    ) {
      const batch = entries.slice(i, i + config.translationService.batchSize);

      // Prepare payload as array of objects
      const batchData = batch.map(([key, value]) => ({ key, value }));

      const response = await service.translate(batchData, toLanguage);
      // `service.translate` already returns Record<string,string>
      Object.assign(results, response);
    }

    return results;
  } else {
    // --- Singular processing ---
    const results: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      const response = await service.translate({ [key]: value }, toLanguage);
      Object.assign(results, response);
    }

    return results;
  }
}

function createTranslateIoBackend(
  options: TranslateIoBackendOptions
): TranslateIoBackendReturn {
  let server: http.Server | undefined;
  let metadata: object[] = [];
  const config: TranslateIoBackendConfig = {
    server: {
      port: options.server.port || 4545, // Default port if not provided
      // Ensure that the auth object is always present
      auth: {
        username: options.server.auth.username || "admin",
        password: bcrypt.hashSync(options.server.auth.password || "admin", 10),
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
      timeout: options.translationService.timeout || 5000, // Default timeout
      method: options.translationService.method || "POST", // Default method
      contentType: options.translationService.contentType || "application/json", // Default content type
      retries: options.translationService.retries || 3, // Default retries
      payload: options.translationService.payload,
      batchProcessing: options.translationService.batchProcessing,
      batchSize: options.translationService.batchSize || 30, // Default batch size
      postProcessing: options.translationService.postProcessing,
    },
  };
  try {
    fs.accessSync(
      config.translations.outputDirectory,
      fs.constants.W_OK | fs.constants.R_OK
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      // If the directory exists but is not accessible, log the error
      logger.error!(
        `Error accessing output directory: ${config.translations.outputDirectory}`,
        error
      );

      throw error;
    }
    // If the directory does not exist, create it
    fs.mkdirSync(config.translations.outputDirectory, { recursive: true });
  }

  // Ensure that the languages array is not empty
  if (
    !config.translations.languages ||
    config.translations.languages.length === 0
  ) {
    throw new Error("No languages specified for translation.");
  }

  // Ensure that the fromFile is specified
  if (!config.translations.fromFile) {
    throw new Error("No fromFile specified for translation.");
  }

  // Ensure that the fromFile exists
  if (!fs.existsSync(config.translations.fromFile)) {
    throw new Error("fromFile does not exist.");
  }

  // Ensure that the languages are valid
  config.translations.languages.forEach((language) => {
    if (!Object.keys(languageNames).includes(language)) {
      throw new Error(
        `Invalid language specified: ${language}. Supported languages are: ${Object.values(
          languageNames
        ).join(", ")}`
      );
    }
  });

  // Ensure that the defaultLanguage is one of the languages specified
  if (
    config.translations.defaultLanguage &&
    !config.translations.languages.includes(config.translations.defaultLanguage)
  ) {
    throw new Error("defaultLanguage must be one of the specified languages.");
  }

  // Ensure that the translation service URL is specified
  if (!config.translationService.url) {
    throw new Error("No translation service URL specified.");
  }

  // Ensure that the payload function is provided
  if (typeof config.translationService.payload !== "function") {
    throw new Error("No payload function specified for translation service.");
  }

  // Ensure that the payload function returns an object
  const testPayload = config.translationService.payload({}, "en", metadata);
  if (!testPayload || typeof testPayload !== "object") {
    throw new Error(
      "The payload function must return an object for the translation service."
    );
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Public endpoint
  app.get("/", (req, res) => res.send("Translate.io Backend is running."));

  // Apply auth middleware to all protected endpoints
  const authMiddleware = basicAuthMiddleware(
    config.server.auth.username,
    config.server.auth.password
  );

  app.use("/languages", authMiddleware);
  app.use("/languageMapping", authMiddleware);
  app.use("/translate", authMiddleware);

  // Languages endpoints
  app.get("/languages", (req, res) => {
    res.json({
      languages: config.translations.languages,
      defaultLanguage: config.translations.defaultLanguage,
    });
  });

  app.get("/languageMapping/:language", (req, res) => {
    const { language } = req.params;
    const mappedLanguage =
      languageNames[language as keyof typeof languageNames];
    if (!mappedLanguage)
      return res.status(404).json({ error: "Language not found." });
    res.json({
      language: mappedLanguage.enName,
      nativeName: mappedLanguage.nativeName,
      code: language,
    });
  });

  // Load translations
  let toTranslate: Record<string, string> = {};
  try {
    const data = fs.readFileSync(config.translations.fromFile, "utf-8");
    toTranslate = config.translations.parseTranslationData(data);
  } catch (error: any) {
    logger.error!("Error loading translations:", error);
    throw error;
  }

  app.get("translate/:toLang", async (req, res) => {
    const { toLang } = req.params;

    if (!config.translations.languages.includes(toLang)) {
      return res.status(400).json({ error: "Unsupported target language." });
    }

    try {
      const translated = await translateWithBatching(
        toTranslate,
        toLang,
        config,
        metadata
      );
      res.json({ translations: translated });
    } catch (error: any) {
      logger.error!("Translation error:", error);
      res
        .status(500)
        .json({ error: "Translation failed.", details: error.message });
    }
  });

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
