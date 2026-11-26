import * as z from "zod/v4";

/** Hard caps for MCP tool inputs that can fan out into many 2c8 API calls. */
export const MAX_PAGINATION_RESULTS = 500;
export const MAX_RESOLVE_SYMBOL_IDS = 50;
export const MAX_HANDOFF_AUTODISCOVER_MODELS = 20;
export const MAX_UPDATE_TITLES_ITEMS = 100;
export const MAX_DOCUMENT_KEYS = 50;

export const uuid = z.string().uuid().describe("UUID");

export const repositoryId = z
  .string()
  .min(1)
  .describe("Repository UUID, or draft alias where supported");

export const projection = z
  .enum(["DEFAULT", "ALL", "SIMPLE"])
  .optional()
  .describe("Response projection");

export const pagination = {
  startAt: z.coerce.string().optional().describe("Pagination start index"),
  maxResults: z.coerce
    .string()
    .optional()
    .refine(
      (s) => {
        if (s === undefined || s === "") return true;
        const n = Number(s);
        return Number.isFinite(n) && n > 0 && n <= MAX_PAGINATION_RESULTS;
      },
      { message: `maxResults must be 1–${MAX_PAGINATION_RESULTS}` },
    )
    .describe(`Max results to return (1–${MAX_PAGINATION_RESULTS})`),
  sortBy: z.string().optional().describe("Sort field"),
  sortOrder: z.enum(["ASC", "DESC"]).optional().describe("Sort order"),
  fields: z.string().optional().describe("Comma-separated fields to include"),
  projection,
};

export const permissionGroupHeader = z
  .string()
  .uuid()
  .optional()
  .describe(
    "Optional 2c8-Permission-Group header. Use All Users UUID 8ea77d81-d79c-40f8-8cfc-279fe9e7b2eb for default.",
  );

export const jsonBody = z
  .record(z.string(), z.unknown())
  .describe("JSON request body matching the 2c8 OpenAPI DTO for this operation");

export const languageId = uuid.describe("Language UUID for titles");
