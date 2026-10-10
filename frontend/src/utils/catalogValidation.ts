import { z } from "zod";

const amount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(/^\d{1,7}(\.\d{1,2})?$/, `${label.charAt(0).toUpperCase()}${label.slice(1)} must be a valid amount (up to 2 decimals).`);

const wholeNumber = (label: string) =>
  z.string().trim().regex(/^\d{1,7}$/, `${label} must be a whole number, 0 or more.`);

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(50, "Name is too long."),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name.").max(100, "Name is too long."),
  sku: z
    .string()
    .trim()
    .max(30, "Code is too long.")
    .refine(
      (value) => value === "" || /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value),
      "Use letters, numbers, dot, dash or underscore."
    ),
  categoryId: z.string().min(1, "Choose a category."),
  description: z.string().trim().max(500, "Description is too long (500 characters max)."),
  sellingPrice: amount("the selling price").refine((v) => Number(v) > 0, "Selling price must be greater than 0."),
  costPrice: amount("the cost price"),
  gstPercent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "GST must be a number between 0 and 100.")
    .refine((v) => Number(v) <= 100, "GST must be between 0 and 100."),
  stockQuantity: wholeNumber("Stock"),
  minStock: wholeNumber("Minimum stock"),
  prepTimeMin: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,3}$/.test(v) && Number(v) <= 600), "Enter minutes from 0 to 600."),
  isAvailable: z.boolean(),
});
export type ProductFormValues = z.infer<typeof productFormSchema>;
