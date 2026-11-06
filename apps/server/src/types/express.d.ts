import { TokenPayload } from "../modules/auth/auth.service";

// Extends the Express Request type globally so req.user is available
// and typed in every controller and middleware without casting
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}
