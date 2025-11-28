import bcrypt from "bcryptjs";
import express from "express";

export const basicAuthMiddleware =
  (username: string, hashedPassword: string) =>
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Translate.io"');
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const base64Credentials = auth.split(" ")[1];
      const decoded = Buffer.from(base64Credentials, "base64").toString(
        "utf-8"
      );
      const [inputUser, inputPass] = decoded.split(":");

      const passwordMatch = await bcrypt.compare(inputPass, hashedPassword);

      if (inputUser !== username || !passwordMatch) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Translate.io"');
        return res.status(401).json({ error: "Unauthorized" });
      }

      next();
    } catch (err) {
      return res
        .status(400)
        .json({ error: "Invalid Authorization header format" });
    }
  };
