import express from "express";

export function productionBlock(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (process.env.NODE_ENV === "production") {
    return res.status(503).json({
      success: false,
      error:
        "This route is not accessible when the server is running in production mode",
    });
  }

  next();
}
