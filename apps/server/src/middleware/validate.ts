import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

type Source = "body" | "query" | "params";

export const validate =
  (schema: ZodType, source: Source = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (source === "body") {
      // Replaces req.body with cleaned data (trimmed, lowercased, phone normalised)
      req.body = result.data;
    } else {
      // Query and params are stored on res.locals instead of being overwritten
      res.locals[source] = result.data;
    }
    return next();
  };