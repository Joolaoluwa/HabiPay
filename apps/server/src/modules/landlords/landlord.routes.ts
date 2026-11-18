import {Router} from "express"
import { validate } from "../../middleware/validate"
import {authenticate} from "../../middleware/authenticate"
import { authorize } from "../../middleware/authorize"
import { errorHandler } from "../../middleware/errorHandler"
import { createLandlordSchema, validateLandlordSchema } from "./landlord.types"
import { CreateLandlord, getLandlordById, updateLandlordById, verifyLandlord } from "./landlord.controller"

export const landLordRouter = Router();

landLordRouter.post("/landlord", validate(createLandlordSchema), authenticate, authorize("landlord"), CreateLandlord);
landLordRouter.get("/landlord/:id", authenticate, authorize("landlord"), getLandlordById);
landLordRouter.put("/landlord/:id", authenticate, authorize("landlord"), updateLandlordById)
landLordRouter.put("/landlord/:id/verify", authenticate, authorize("admin"), verifyLandlord)