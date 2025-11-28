import express from "express";
import { languageNames } from "@translateio/shared";
import type { TranslateIoBackendConfig } from "@/types";

export const registerLanguagesRoutes = (
  app: express.Application,
  config: TranslateIoBackendConfig
) => {
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
};
