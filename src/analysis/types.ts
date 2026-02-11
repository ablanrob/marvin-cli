export interface AnalyzeOptions {
  marvinDir: string;
  meetingId: string;
  draft: boolean;
  persona: string;
}

export interface AnalyzeResult {
  meetingId: string;
  artifacts: string[];
  draft: boolean;
}
