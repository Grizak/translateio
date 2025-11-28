import nodeloggerg from "nodeloggerg";

const logger = nodeloggerg({
  serverConfig: {
    startWebServer: false,
  },
  logLevel: "info",
  logFile: "translateio-backend.log",
  compressOldLogs: true,
});

export default logger;
