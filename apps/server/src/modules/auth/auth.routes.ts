import { Router } from "express";
import { validate } from "../../middleware/validate";
import { signupSchema } from "./auth.types";
import { signup } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", validate(signupSchema), signup);
