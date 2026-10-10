import { z } from "zod";
import { MAX_RANGE_DAYS, isValidYmd } from "../utils/dateRange";

const dateField = z.string().refine(isValidYmd, "Use the date format YYYY-MM-DD.");

export const dashboardQuerySchema = z
  .object({
    range: z.enum(["today", "week", "month", "custom"]).default("today"),
    from: dateField.optional(),
    to: dateField.optional(),
  })
  .superRefine((query, ctx) => {
    if (query.range !== "custom") return;

    if (!query.from || !query.to) {
      ctx.addIssue({ code: "custom", message: "Choose both a start and an end date.", path: ["from"] });
      return;
    }
    if (query.from > query.to) {
      ctx.addIssue({ code: "custom", message: "The start date must not be after the end date.", path: ["from"] });
      return;
    }
    const days = (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000 + 1;
    if (days > MAX_RANGE_DAYS) {
      ctx.addIssue({ code: "custom", message: "Please choose a range of one year or less.", path: ["to"] });
    }
  });
