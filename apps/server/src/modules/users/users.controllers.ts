import {Request, Response} from "express"
import { eq, desc, count } from "drizzle-orm";
import {db} from "../../config/db"
import {users} from "../../db/schema/users"
import { UserId, UpdateSchema, detailsSchema } from "./users.types";
import { AppError } from "../../utils/appresponse";
import { encryptField } from "../../utils/encryption";

export async function getUserById(req: Request, res: Response){
    const { id } = req.params as UserId;

    if(!id){
        throw new AppError(404, "User cannot be found")
    }

    const requester = req.user; // { id, role } set by your auth middleware

    const isAdmin = requester?.role === "admin";
    const isSelf = requester?.id === id;

  if (!isAdmin && !isSelf) {
    throw new AppError(403, "You do not have permission to access this resource")
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.full_name,
      role: users.role,
      status: users.status,
      createdAt: users.created_at,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    throw new AppError(404, "User cannot be found")
  }

  return res.status(200).json(user);
}

export async function getAllUsers(req: Request, res: Response){
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.full_name,
      role: users.role,
      status: users.status,
      createdAt: users.created_at,
    })
    .from(users)
    .orderBy(desc(users.created_at))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(users);

  return res.status(200).json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function updateByID(req: Request, res: Response){
  const { id } = req.params as UserId;

  const {full_name, role, status } = req.body as UpdateSchema

  const requester = req.user!; // { id, role } set by your auth middleware

  const touchesPrivileged = role !== undefined || status !== undefined;
  if (touchesPrivileged && requester.role !== "admin") {
    throw new AppError(403, "You do not have permission to change role or status");
  }
  const [updated] = await db.update(users)
                          .set({full_name, role, status})
                          .where(eq(users.id, id))
                          .returning({
                            id: users.id,
                            full_name: users.full_name,
                            role: users.role,
                            status: users.status,
                            created_at: users.created_at
                          })

  return res.status(200).json({
    success: true,
    data: updated,
  })
}

export async function updateUserDetails(req: Request, res: Response){

  const { id } = req.params as UserId;
  const {bvn, nin} = req.body as detailsSchema

  if(!bvn || !nin || !id){
    throw new AppError(400, "Bad user request");
  }

  const requesterId = req.user!.id

  const encryptedBvnValue = encryptField(bvn, requesterId);
  const encryptedNinValue = encryptField(nin, requesterId);
  try{
    let [update] = await db
    .update(users).set({bvn_encrypted: encryptedBvnValue, nin_encrypted: encryptedNinValue})
    .where(eq(users.id, requesterId))
    .returning({            
      id: users.id,
      full_name: users.full_name,
      role: users.role,
      status: users.status,
      created_at: users.created_at
})
if (!update){
  throw new AppError(404, "User not found")
}
return res.status(200).json({
  message: "success",
  data: update
})
  }catch(err){
    throw new AppError(500, "Server side error")
  }
}