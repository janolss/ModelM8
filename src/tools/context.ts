import type { TwoC8Client } from "../api/twoc8-client.js";
import type { AppConfig } from "../config.js";
import type { DocumentsService } from "../domain/documents.js";
import type { ProcessReader } from "../domain/process-reader.js";
import type { ProcessWriter } from "../domain/process-writer.js";
import type { MethodologyPack } from "../methodology/loader.js";

export interface ToolContext {
  client: TwoC8Client;
  pack: MethodologyPack;
  config: AppConfig;
  reader: ProcessReader;
  writer: ProcessWriter | null;
  documents: DocumentsService;
}
