import createTranslateio from "@translateio/backend";
import "dotenv/config";

const translateIo = createTranslateio({
  server: {
    port: 4545,
    auth: {
      username: "admin",
      password: "admin",
    },
  },
  translations: {
    fromFile: "./translations.json",
    languages: ["en", "es", "fr"],
    defaultLanguage: "en",
    parseTranslationData: (data) => {
      return JSON.parse(data);
    },
  },
  translationService: {
    url: "https://api-free.deepl.com/v2/translate",
    headers: {
      "Content-Type": "application/json",
      Authorization: "DeepL-Auth-Key " + process.env.DEEPL_API_KEY,
    },
    timeout: 5000,
    method: "POST",
    contentType: "application/json",
    retries: 3,
    payload: (translationData, toLanguage) => {
      return {
        text: translationData,
        target_lang: toLanguage,
      };
    },
    batchProcessing: true,
    postProcessing: (data) => {
      return data.map((item: { text: string }) => ({
        ...item,
        text: item.text.replace(/<[^>]*>/g, ""), // Remove HTML tags
      }));
    },
  },
});

translateIo.start();
