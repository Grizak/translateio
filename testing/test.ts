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
    // translationData will be an array of { key, content } when batchProcessing is true
    payload: (translationData, toLanguage) => {
      const entries = Array.isArray(translationData)
        ? translationData
        : [translationData];
      return {
        text: entries.map((e) => e.content),
        target_lang: toLanguage.toUpperCase(),
      };
    },
    batchProcessing: true,
    // DeepL returns { translations: [{ text: string }] }
    // We need to map back to { key, content } using the original order
    postProcessing: (data) => {
      return (data.translations as { text: string }[]).map((item, i) => ({
        key: String(i), // placeholder — real impl should preserve keys from payload
        content: item.text,
      }));
    },
  },
});

translateIo.start();
