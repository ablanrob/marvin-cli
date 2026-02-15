import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { DocumentStore } from "../storage/store.js";
import type { DocumentTypeRegistration } from "../storage/types.js";
import { createMeetingTools } from "./builtin/tools/meetings.js";
import { createReportTools } from "./builtin/tools/reports.js";
import { createFeatureTools } from "./builtin/tools/features.js";
import { createEpicTools } from "./builtin/tools/epics.js";
import { createContributionTools } from "./builtin/tools/contributions.js";

export const COMMON_REGISTRATIONS: DocumentTypeRegistration[] = [
  { type: "meeting", dirName: "meetings", idPrefix: "M" },
  { type: "report", dirName: "reports", idPrefix: "R" },
  { type: "feature", dirName: "features", idPrefix: "F" },
  { type: "epic", dirName: "epics", idPrefix: "E" },
  { type: "contribution", dirName: "contributions", idPrefix: "C" },
];

export function createCommonTools(store: DocumentStore): SdkMcpToolDefinition<any>[] {
  return [
    ...createMeetingTools(store),
    ...createReportTools(store),
    ...createFeatureTools(store),
    ...createEpicTools(store),
    ...createContributionTools(store),
  ];
}
