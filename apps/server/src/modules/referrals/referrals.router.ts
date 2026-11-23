import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  createReferralSchema,
  listReferralsQuerySchema,
  referralIdParamSchema,
  updateReferralSchema,
} from "./referrals.types";
import {
  createReferral,
  getReferralById,
  listReferrals,
  updateReferral,
} from "./referrals.controller";

// Mounted at /api/v1/referrals
// Landlords have no access: a referral holds a third party's contact details
export const referralRouter = Router();

const idParam = validate(referralIdParamSchema, "params");

referralRouter.post("/", authenticate, authorize("tenant"), validate(createReferralSchema), createReferral);
referralRouter.get(
  "/",
  authenticate,
  authorize("tenant", "admin"),
  validate(listReferralsQuerySchema, "query"),
  listReferrals,
);
referralRouter.get("/:id", authenticate, authorize("tenant", "admin"), idParam, getReferralById);
referralRouter.patch(
  "/:id",
  authenticate,
  authorize("admin"),
  idParam,
  validate(updateReferralSchema),
  updateReferral,
);
