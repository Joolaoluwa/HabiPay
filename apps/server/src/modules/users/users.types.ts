import {z} from "zod"

export type UserId = {
    id: string
}

export const updateSchema = z
.object({
    full_name: z.string().trim().min(2, "Your name cannot be less than one character").max(100, "Your full name cannot exceed 100 characters").optional(),
    role: z.enum(["landlord", "tenant", "admin"], "The main values are tenant, landlord, admin").optional(),
    status: z.enum(["active", "pending", "suspended"], "Your status can only be active, suspended or pending").optional()
}).strict()

export const detailsSchema = z
.object({
    bvn: z.string().trim().regex(/^\d{11}$/, "Your BVN must contain 11 characters"),
    nin: z.string().trim().regex(/^\d{11}$/, "Your NIN must contain 11 characters")
})

export type UpdateSchema = z.infer<typeof updateSchema>;
export type detailsSchema = z.infer<typeof detailsSchema>;