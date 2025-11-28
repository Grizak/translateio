import express from "express";

export const registerHealthRoutes = (app: express.Application) => {
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });
};
