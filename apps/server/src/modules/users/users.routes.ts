import { Router } from "express";
import { getAllUsers, getUserById, updateByID, updateUserDetails } from "./users.controllers";
import { authenticate } from "../../middleware/authenticate";
import {selfOrAdmin, authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate"
import { detailsSchema, updateSchema } from "./users.types";

export const userRouter = Router();

userRouter.get("/:id", authenticate, selfOrAdmin(), getUserById);
userRouter.get("/", authenticate, authorize("admin"), getAllUsers);
userRouter.patch("/:id", validate(updateSchema), authenticate, selfOrAdmin(), updateByID);
userRouter.patch("/:id/kyc", validate(detailsSchema), authenticate, selfOrAdmin(), updateUserDetails);
