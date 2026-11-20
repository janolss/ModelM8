import * as z from "zod/v4";

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
  maxResults: z.coerce.string().optional().describe("Max results to return"),
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
