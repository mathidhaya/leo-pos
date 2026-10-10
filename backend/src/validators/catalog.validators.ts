import { z } from "zod";
import { isUploadUrl } from "../config/uploads";

export const idParamSchema = z.string().uuid("Invalid id.");

// undefined = leave the image as it is, null = remove it
const imageUrlField = z
  .string()
  .refine(isUploadUrl, "Please upload the image again.")
  .nullable()
  .optional();

// Money arrives as text like "150" or "150.50" and stays text until the database.
const amountField = (label: string, allowZero: boolean) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(
      z
        .string()
        .regex(/^\d{1,7}(\.\d{1,2})?$/, `${label} must be a valid amount with up to 2 decimals.`)
        .refine((value) => allowZero || Number(value) > 0, `${label} must be greater than 0.`)
    );

const gstField = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "GST must be a number between 0 and 100.")
      .refine((value) => Number(value) <= 100, "GST must be between 0 and 100.")
  );

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,29}$/;

const productBase = z.object({
  name: z.string().trim().min(2, "Product name is required.").max(100, "Product name is too long."),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => value === "" || SKU_RE.test(value),
      "Product code can use letters, numbers, dot, dash and underscore (30 characters max)."
    )
    .optional(),
  categoryId: z.string().uuid("Please choose a category."),
  description: z
    .string()
    .trim()
    .max(500, "Description is too long (500 characters max).")
    .optional()
    .transform((value) => (value ? value : null)),
  imageUrl: imageUrlField,
  sellingPrice: amountField("Selling price", false),
  costPrice: amountField("Cost price", true),
  gstPercent: gstField,
  prepTimeMin: z
    .number()
    .int("Preparation time must be a whole number of minutes.")
    .min(0, "Preparation time cannot be negative.")
    .max(600, "Preparation time is too long.")
    .nullable()
    .optional(),
  minStock: z
    .number()
    .int("Minimum stock must be a whole number.")
    .min(0, "Minimum stock cannot be negative.")
    .max(1_000_000, "Minimum stock is too large."),
  isAvailable: z.boolean(),
});

// Stock is only set when a product is created. Later changes go through Inventory.
export const createProductSchema = productBase.extend({
  stockQuantity: z
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(1_000_000, "Stock is too large."),
});

export const updateProductSchema = productBase;

export const availabilitySchema = z.object({ isAvailable: z.boolean() });

export const listProductsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  stock: z.enum(["all", "low", "out"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const categoryBodySchema = z.object({
  name: z.string().trim().min(2, "Category name is required.").max(50, "Category name is too long."),
  imageUrl: imageUrlField,
  isActive: z.boolean(),
});

export const deleteCategoryQuerySchema = z.object({
  reassignTo: z.string().uuid().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CategoryInput = z.infer<typeof categoryBodySchema>;
