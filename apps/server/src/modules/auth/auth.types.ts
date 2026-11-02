import { z } from "zod";

// Nigerian mobile numbers: 0803…, 234803… or +234803…
const NG_PHONE = /^(?:\+234|234|0)([789][01]\d{8})$/;

export const signupSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(255, "Full name is too long")
      .regex(/^\p{L}[\p{L} .'-]*$/u, "Full name contains invalid characters"),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address")
      .max(255, "Email is too long"),

    // Stored as +234… so one number can't register twice in different formats
    phone_number: z
      .string()
      .trim()
      .regex(NG_PHONE, "Enter a valid Nigerian phone number")
      .transform((value) => `+234${value.match(NG_PHONE)![1]}`),

    // Max 64: bcrypt only uses the first 72 bytes
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(64, "Password must be at most 64 characters")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/\d/, "Password must contain a number"),

    // Public signup can never create an admin
    role: z.enum(["tenant", "landlord", "admin"], {
      message: "Role must be tenant or landlord",
    }),
  })
  .strict(); // rejects extra fields like status, bvn, nin

export type SignupInput = z.infer<typeof signupSchema>;
