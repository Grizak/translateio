interface TranslationServiceConfig {
  url: string;
  headers?: Record<string, string>;
  timeout: number;
  method: "POST" | "GET";
  contentType: "application/json" | "application/x-www-form-urlencoded";
  retries: number;
  payload: (
    translationData: object[] | object,
    toLanguage: string,
    metadata?: object[]
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
    /**
     * Rate limiting configuration for the server.
     */
    rateLimit?: {
      /**
       * Enable or disable rate limiting. Defaults to true.
       * @default true
       */
      enabled?: boolean;
      /**
       * The time window in milliseconds for rate limiting. Defaults to 60000 (1 minute).
       * @default 60000
       */
      windowMs?: number;
      /**
       * The maximum number of requests allowed per time window. Defaults to 100.
       * @default 100
       */
      maxRequests?: number;
      /**
       * An array of paths to skip rate limiting on (e.g., ["/health"]).
       * @default ["/health"]
       */
      skipPaths?: string[];
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
     * @param data - The raw translation data string from the input file.
     * @returns An object mapping translation keys to their corresponding translated strings.
     */
    parseTranslationData: (data: string) => Record<string, string>;
    /**
     * A function to parse the metadata from the input file.
     * @param data - The raw metadata string from the input file.
     * @returns An array of metadata objects.
     */
    parseMetadata?: (data: string) => object[];
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
      toLanguage: string,
      metadata?: object[]
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
    /**
     * Post-processing function to apply to the translation data after receiving it from the translation service.
     * This can be used to format or clean up the translated text.
     */
    postProcessing: (data: any) => { key: string; value: string }[];
  };
}

// Recursive type to make all properties required
type RequiredRecursive<T> = {
  [P in keyof T]-?: NonNullable<T[P]> extends object
    ? NonNullable<T[P]> extends Array<infer U>
      ? Array<RequiredRecursive<U>>
      : NonNullable<T[P]> extends Function
      ? NonNullable<T[P]>
      : RequiredRecursive<NonNullable<T[P]>>
    : NonNullable<T[P]>;
};

type TranslateIoBackendConfig = RequiredRecursive<TranslateIoBackendOptions>;

interface TranslateIoBackendReturn {
  start: () => void;
  stop: () => void;
}

interface TranslationService {
  translate: (
    translations: Record<string, string> | Record<string, string>[],
    targetLanguage: string
  ) => Promise<Record<string, string>>;
  getMetadata: (language: string) => Promise<object[]>;
  setMetadata: (language: string, metadata: object[]) => Promise<void>;
}

interface AsyncTranslationRequest {
  id: string;
  data: Record<string, string>;
  targetLanguage: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: Record<string, string>;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

type SSEEventType = "start" | "progress" | "complete" | "error";

interface SSEEvent {
  type: SSEEventType;
  requestId: string;
  data: any;
  timestamp: string;
}

export type {
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
  AsyncTranslationRequest,
  SSEEvent,
  SSEEventType,
};
