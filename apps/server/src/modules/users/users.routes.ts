import { Router } from "express";
import { getAllUsers, getUserById, updateByID, updateUserDetails } from "./users.controllers";
import { authenticate } from "../../middleware/authenticate";
import {selfOrAdmin, authorize} from "../../middleware/authorize";
import {validate} from "../../middleware/validate"
import { detailsSchema, updateSchema } from "./users.types";

export const userRouter = Router();

userRouter.get("/users/:id", authenticate, selfOrAdmin(), getUserById);
userRouter.get("/users", authenticate, authorize("admin"), getAllUsers);
userRouter.patch("/users/:id", validate(updateSchema), authenticate, selfOrAdmin(), updateByID);
userRouter.patch("/users/:id/kyc", validate(detailsSchema), authenticate, selfOrAdmin(), updateUserDetails);
