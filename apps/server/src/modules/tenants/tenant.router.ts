import { Router } from "express";
import { authorize } from "../../middleware/authorize";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  createTenantSchema,
  tenantIdParamSchema,
  tenantVerificationSchema,
  updateTenantSchema,
} from "./tenant.types";
import {
  createTenant,
  getMyTenant,
  getTenantById,
  reviewTenantVerification,
  updateTenantById,
} from "./tenant.controller";

// Mounted at /api/v1/tenants
// Order on every route: authenticate → authorize → validate params → validate body,
// so a request with no token gets 401 before any validation error
export const tenantRouter = Router();

tenantRouter.post(
  "/",
  authenticate,
  authorize("tenant"),
  validate(createTenantSchema),
  createTenant,
);

// Registered before /:id so "me" is not read as an id
tenantRouter.get("/me", authenticate, authorize("tenant"), getMyTenant);

tenantRouter.get(
  "/:id",
  authenticate,
  authorize("tenant", "admin"),
  validate(tenantIdParamSchema, "params"),
  getTenantById,
);

tenantRouter.put(
  "/:id",
  authenticate,
  authorize("tenant", "admin"),
  validate(tenantIdParamSchema, "params"),
  validate(updateTenantSchema),
  updateTenantById,
);

tenantRouter.patch(
  "/:id/verification",
  authenticate,
  authorize("admin"),
  validate(tenantIdParamSchema, "params"),
  validate(tenantVerificationSchema),
  reviewTenantVerification,
);
