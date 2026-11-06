import { Router } from "express";
import { validate } from "../../middleware/validate";
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.types";
import {
  login,
  signup,
  verifyOtpHandler,
  resendOtpHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/signup", validate(signupSchema), signup);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtpHandler);
authRouter.post("/resend-otp", validate(resendOtpSchema), resendOtpHandler);
authRouter.post("/forgot-password", validate(forgotPasswordSchema), forgotPasswordHandler);
authRouter.post("/reset-password", validate(resetPasswordSchema), resetPasswordHandler);
authRouter.post("/login", validate(loginSchema), login);
