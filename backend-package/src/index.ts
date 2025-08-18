import { languageNames } from "@translateio/shared";
import fs from "fs";
import nodeloggerg from "nodeloggerg";
import express from "express";
import axios from "axios";

const logger = nodeloggerg({
  serverConfig: {
    startWebServer: false,
  },
  logLevel: "info",
  logFile: "translateio-backend.log",
  compressOldLogs: true,
});

interface TranslationServiceConfig {
  url: string;
  headers?: Record<string, string>;
  timeout: number;
  method: "POST" | "GET";
  contentType: "application/json" | "application/x-www-form-urlencoded";
  retries: number;
  payload: (
    translationData: object[] | object,
    toLanguage: string
  ) => Record<string, any>;
  batchProcessing: boolean;
}

interface TranslateIoBackendOptions {
  /**
   * Config for the server
   */
  server: {
    /**
     * The port to run the server on. Defaults to 4545 if not provided.
     * @default 4545
     */
    port?: number;
    /**
     * Authentication configuration for the server.
     */
    auth: {
      /**
       * Username for server authentication. Defaults to "admin" if not provided.
       * @default "admin"
       */
      username?: string;
      /**
       * Password for server authentication. Defaults to "admin" if not provided.
       * @default "admin"
       */
      password?: string;
    };
  };
  /**
   * Configuration for translations.
   */
  translations: {
    /**
     * The file to read translations from. Has to be specified.
     */
    fromFile: string;
    /**
     * The directory to output translations to. Defaults to the current working directory's translations folder.
     * If the directory does not exist, it will be created.
     * @default `${process.cwd()}/translations`
     */
    outputDirectory?: string;
    /**
     * An array of languages to support. Has to be specified.
     */
    languages: string[];
    /**
     * The default language to use for translations.
     * If not specified, the first language in the `languages` array will be used.
     */
    defaultLanguage?: string;
    /**
     * A function to parse the translation data from the input file.
     */
    parseTranslationData: (data: string) => Record<string, string>;
  };
  /**
   * Specifications for the translation service.
   */
  translationService: {
    /**
     * The URL of the translation service. This is required.
     */
    url: string;
    /**
     * Additional headers to include in requests to the translation service.
     * The api key should be included in the headers if required by the translation service.
     */
    headers?: Record<string, string>;
    /**
     * The timeout for requests to the translation service in milliseconds.
     * @default 5000
     */
    timeout?: number;
    /**
     * The request method to use for the translation service.
     * @default "POST"
     */
    method?: "POST" | "GET";
    /**
     * The content type for requests to the translation service.
     * @default "application/json"
     */
    contentType?: "application/json" | "application/x-www-form-urlencoded";
    /**
     * The maximum number of retries for failed requests to the translation service.
     * @default 3
     */
    retries?: number;
    /**
     * The payload to send to the translation service.
     * This can be used to specify the structure of the request body.
     * You should ensure that the payload function returns an object that matches the expected format of the translation service.
     * You should make sure that the payload function checks whether it's used in batch processing or singular requests and formats the data accordingly.
     * @param translationData - The data to be translated, which can be an object or an array of objects.
     * @param toLanguage - The target language for the translation.
     */
    payload: (
      translationData: object[] | object,
      toLanguage: string
    ) => Record<string, any>;
    /**
     * Specifies if the translation payload function should be called using batch processing or singular requests.
     * If set to `true`, the payload function will handle multiple translations at once.
     * If set to `false`, it will handle each translation individually.
     */
    batchProcessing: boolean;
    /**
     * Optional batch size for batch processing. Defaults to 30 if not provided.
     * This is used to determine how many translations to send in a single request when batch processing is enabled.
     * @default 30
     */
    batchSize?: number;
  };
}

interface TranslateIoBackendConfig {
  /**
   * Resolved server configuration with defaults applied
   */
  server: {
    /**
     * The port to run the server on (resolved with default)
     */
    port: number;
    /**
     * Authentication configuration (always present with defaults)
     */
    auth: {
      /**
       * Username for server authentication (resolved with default)
       */
      username: string;
      /**
       * Password for server authentication (resolved with default)
       */
      password: string;
    };
  };
  /**
   * Resolved translations configuration with defaults applied
   */
  translations: {
    /**
     * The file to read translations from (required, no default)
     */
    fromFile: string;
    /**
     * The directory to output translations to (resolved with default)
     */
    outputDirectory: string;
    /**
     * An array of languages to support (required, no default)
     */
    languages: string[];
    /**
     * The default language (resolved from languages array if not specified)
     */
    defaultLanguage: string | undefined;
    /**
     * A function to parse the translation data from the input file
     */
    parseTranslationData: (data: string) => Record<string, string>;
  };
  /**
   * Resolved translation service configuration with defaults applied
   */
  translationService: {
    /**
     * The URL of the translation service (required, no default)
     */
    url: string;
    /**
     * Headers for translation service requests (resolved with default empty object)
     */
    headers: Record<string, string>;
    /**
     * The timeout for requests in milliseconds (resolved with default)
     */
    timeout: number;
    /**
     * The request method (resolved with default)
     */
    method: "POST" | "GET";
    /**
     * The content type for requests (resolved with default)
     */
    contentType: "application/json" | "application/x-www-form-urlencoded";
    /**
     * The maximum number of retries (resolved with default)
     */
    retries: number;
    /**
     * The payload function (required, no default)
     */
    payload: (
      translationData: object[] | object,
      toLanguage: string
    ) => Record<string, any>;
    /**
     * Batch processing flag (resolved with default)
     */
    batchProcessing: boolean;
    /**
     * Optional batch size for batch processing (resolved with default)
     */
    batchSize: number; // Optional batch size for batch processing
    /**
     * Post-processing function
     */
    postProcessing?: (data: any) => [
      {
        key: string;
        value: string;
      }
    ]; // Post-processing function
  };
}

interface TranslateIoBackendReturn {}

interface TranslationService {
  translate: (
    translations: object[],
    targetLanguage: string
  ) => Promise<string>;
  getMetadata: (language: string) => Promise<object[]>;
  setMetadata: (language: string, metadata: object[]) => Promise<void>;
}

function createTranslationService(
  config: TranslateIoBackendConfig
): TranslationService {
  return {
    translate: async (translations: object[], targetLanguage: string) => {
      const response = await axios(config.translationService.url, {
        headers: config.translationService.headers,
        timeout: config.translationService.timeout,
        method: config.translationService.method,
        data: config.translationService.payload(translations, targetLanguage),
      });
      return response.data;
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

function createTranslateIoBackend(
  options: TranslateIoBackendOptions
): TranslateIoBackendReturn {
  const config: TranslateIoBackendConfig = {
    server: {
      port: options.server.port || 4545, // Default port if not provided
      // Ensure that the auth object is always present
      auth: {
        username: options.server.auth.username || "admin",
        password: options.server.auth.password || "admin",
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
          : undefined),
      parseTranslationData: options.translations.parseTranslationData,
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
  const testPayload = config.translationService.payload({}, "en");
  if (!testPayload || typeof testPayload !== "object") {
    throw new Error(
      "The payload function must return an object for the translation service."
    );
  }

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    res.send("Translate.io Backend is running.");
  });

  app.get("/languages", (req, res) => {
    res.json({
      languages: config.translations.languages,
      defaultLanguage: config.translations.defaultLanguage,
    });
  });

  // Load translations from the specified file
  let toTranslate: Record<string, string> = {};
  try {
    const data = fs.readFileSync(config.translations.fromFile, "utf-8");
    toTranslate = config.translations.parseTranslationData(data);
  } catch (error: any) {
    logger.error!("Error loading translations:", error);
    throw error;
  }

  // Initialize the translation service
  const translationService = createTranslationService(config);

  async function handleTranslationRequest(
    toLanguage: string,
    toTranslate: Record<string, string>
  ): Promise<Record<string, string>> {
    if (!toLanguage || !config.translations.languages.includes(toLanguage)) {
      throw new Error(
        `Invalid or missing target language: ${toLanguage}. Supported languages are: ${config.translations.languages.join(
          ", "
        )}`
      );
    }
    try {
      const translatedData = await translationService.translate(
        Object.entries(toTranslate).map(([key, value]) => ({
          [key]: value,
        })),
        toLanguage
      );
    } catch (error: any) {
      logger.error!("Error during translation:", error);
      throw error;
    }
    return {};
  }

  app.listen(config.server.port, () => {
    logger.info!(
      `Translate.io Backend is running on port ${config.server.port}.`
    );
  });

  return {};
}

export default createTranslateIoBackend;
export type {
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
};
