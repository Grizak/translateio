declare module "@translateio/shared" {
  interface LanguageNames {
    [key: string]: {
      enName: string;
      nativeName: string;
    };
  }

  export const languageNames: LanguageNames;
}
