import type { MarketingInput } from "./marketing-engine.ts";

export type UploadedFileInfo = {
  name?: string;
  mimeType?: string;
  data?: string;
};

export type AnalyzeRequestBody = {
  input?: MarketingInput;
  rawText?: string;
  fileInfo?: UploadedFileInfo;
};
