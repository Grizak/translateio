declare module "@translateio/backend" {
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
      batchSize: number;
      /**
       * Post-processing function
       */
      postProcessing?: (data: any) => [
        {
          key: string;
          value: string;
        }
      ];
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
  function createTranslateIoBackend(
    options: TranslateIoBackendOptions
  ): TranslateIoBackendReturn;
  export default createTranslateIoBackend;
  export type {
    TranslateIoBackendOptions,
    TranslateIoBackendConfig,
    TranslateIoBackendReturn,
    TranslationService,
    TranslationServiceConfig,
  };
}
