import type { AnalyzeRequestBody } from "./http-contracts.ts";
import {
  buildAnalyzeResponse,
  buildRecognizeInputResponse,
} from "./marketing-api.ts";

export type { AnalyzeRequestBody };

export const runAnalyzeRequest = async (body: AnalyzeRequestBody) =>
  buildAnalyzeResponse(body);

export const runRecognizeInputRequest = async (body: AnalyzeRequestBody) =>
  buildRecognizeInputResponse(body);
