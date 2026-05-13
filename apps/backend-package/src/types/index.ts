// ─── File structures ─────────────────────────────────────────────────────────

/**
 * A single entry in the source translation file.
 * This is the canonical string that will be translated into each target language.
 */
interface SourceEntry {
  content: string;
}

/**
 * The full structure of a fromFile source file.
 * Keys are translation identifiers, values are the source content.
 */
type SourceFile = Record<string, SourceEntry>;

/**
 * Metadata attached to each entry in an output translation file.
 * Tracks the state of the translation for that key.
 */
interface TranslationMetadata {
  /** Whether this key has ever been run through the translation service. */
  translated: boolean;
  /** Whether the user has manually edited this output entry. Prevents automatic overwriting. */
  userChanged: boolean;
  /** Whether the source content has changed since this key was last translated. */
  changed: boolean;
  /** ISO timestamp of when this key was last translated. */
  lastTranslated: string | null;
}

/**
 * A single entry in an output translation file.
 */
interface OutputEntry {
  content: string;
  metadata: TranslationMetadata;
}

/**
 * The full structure of an output translation file (translated/{lang}.json).
 */
type OutputFile = Record<string, OutputEntry>;

// ─── Configuration ────────────────────────────────────────────────────────────

interface TranslationServiceConfig {
  url: string;
  headers?: Record<string, string>;
  timeout: number;
  method: "POST" | "GET";
  contentType: "application/json" | "application/x-www-form-urlencoded";
  retries: number;
  payload: (
    translationData:
      | { key: string; content: string }[]
      | { key: string; content: string },
    toLanguage: string,
  ) => Record<string, any>;
  batchProcessing: boolean;
}

interface TranslateIoBackendOptions {
  /**
   * Config for the server.
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
       * It's highly recommended to set this in production, since anyone with this
       * string will be able to access the server.
       * @default "admin"
       */
      username?: string;
      /**
       * Password for server authentication. Defaults to "admin" if not provided.
       * It's highly recommended to set this in production, since anyone with this
       * string will be able to access the server.
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
     * Path to the source translation file. Must be a valid SourceFile JSON.
     */
    fromFile: string;
    /**
     * The directory to output translations to. Defaults to the current working directory's translations folder.
     * If the directory does not exist, it will be created.
     * @default `${process.cwd()}/translations`
     */
    outputDirectory?: string;
    /**
     * An array of target language codes to translate into. At least one is required.
     */
    languages: string[];
    /**
     * The default language to use. Defaults to the first entry in `languages` if not specified.
     */
    defaultLanguage?: string;
  };
  /**
   * Specifications for the external translation service.
   */
  translationService: {
    /**
     * The URL of the translation service. Required.
     */
    url: string;
    /**
     * Additional headers to include in requests (e.g. API keys).
     */
    headers?: Record<string, string>;
    /**
     * Request timeout in milliseconds.
     * @default 5000
     */
    timeout?: number;
    /**
     * HTTP method to use.
     * @default "POST"
     */
    method?: "POST" | "GET";
    /**
     * Content type for requests.
     * @default "application/json"
     */
    contentType?: "application/json" | "application/x-www-form-urlencoded";
    /**
     * Maximum number of retries for failed requests.
     * @default 3
     */
    retries?: number;
    /**
     * Builds the request payload for the translation service.
     * `translationData` will be a single entry or array of entries depending on `batchProcessing`.
     */
    payload: (
      translationData:
        | { key: string; content: string }[]
        | { key: string; content: string },
      toLanguage: string,
    ) => Record<string, any>;
    /**
     * Whether to send multiple keys in a single request.
     * If false, each key is translated individually.
     */
    batchProcessing: boolean;
    /**
     * How many keys to include per batch request. Only used when `batchProcessing` is true.
     * @default 30
     */
    batchSize?: number;
    /**
     * Post-processes the raw response from the translation service.
     * Must return an array of `{ key, content }` pairs.
     */
    postProcessing: (data: any) => { key: string; content: string }[];
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

// ─── Server ───────────────────────────────────────────────────────────────────

interface TranslateIoBackendReturn {
  start: () => void;
  stop: () => void;
}

interface TranslationService {
  translate: (
    entries: { key: string; content: string }[],
    targetLanguage: string,
  ) => Promise<{ key: string; content: string }[]>;
}

// ─── Async jobs ───────────────────────────────────────────────────────────────

interface AsyncTranslationRequest {
  id: string;
  data: SourceFile;
  targetLanguage: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: OutputFile;
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
  SourceEntry,
  SourceFile,
  TranslationMetadata,
  OutputEntry,
  OutputFile,
  TranslateIoBackendOptions,
  TranslateIoBackendConfig,
  TranslateIoBackendReturn,
  TranslationService,
  TranslationServiceConfig,
  AsyncTranslationRequest,
  SSEEvent,
  SSEEventType,
};
