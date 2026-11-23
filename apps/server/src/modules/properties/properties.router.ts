import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { handleImageUpload } from "../../middleware/upload";
import {
  createPropertySchema,
  listPropertiesQuerySchema,
  propertyIdParamSchema,
  propertyImageParamSchema,
  reorderImagesSchema,
  updatePropertySchema,
  updatePropertyStatusSchema,
} from "./properties.types";
import {
  createProperty,
  deletePropertyImage,
  getPropertyById,
  listAmenities,
  listProperties,
  reorderPropertyImages,
  updateProperty,
  updatePropertyStatus,
  uploadPropertyImages,
} from "./properties.controller";

// Mounted at /api/v1/properties
export const propertyRouter = Router();

const anyRole = authorize("tenant", "landlord", "admin");
const manager = authorize("landlord", "admin");
const idParam = validate(propertyIdParamSchema, "params");

// Registered before /:id, or "amenities" would be read as an id (and fail uuid validation)
propertyRouter.get("/amenities", authenticate, anyRole, listAmenities);

// ── Properties ──────────────────────────────────────────────────────────────
propertyRouter.post("/", authenticate, authorize("landlord"), validate(createPropertySchema), createProperty);
propertyRouter.get("/", authenticate, anyRole, validate(listPropertiesQuerySchema, "query"), listProperties);
propertyRouter.get("/:id", authenticate, anyRole, idParam, getPropertyById);
propertyRouter.put("/:id", authenticate, manager, idParam, validate(updatePropertySchema), updateProperty);
propertyRouter.patch(
  "/:id/status",
  authenticate,
  manager,
  idParam,
  validate(updatePropertyStatusSchema),
  updatePropertyStatus,
);

// ── Images ──────────────────────────────────────────────────────────────────
// handleImageUpload parses multipart/form-data, so it comes after the cheap checks:
// no file is read into memory for a request that would be rejected anyway
propertyRouter.post("/:id/images", authenticate, manager, idParam, handleImageUpload, uploadPropertyImages);
propertyRouter.patch("/:id/images", authenticate, manager, idParam, validate(reorderImagesSchema), reorderPropertyImages);
propertyRouter.delete(
  "/:id/images/:imageId",
  authenticate,
  manager,
  validate(propertyImageParamSchema, "params"),
  deletePropertyImage,
);
