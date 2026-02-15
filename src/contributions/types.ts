export interface ContributeOptions {
  marvinDir: string;
  persona: string;
  contributionType: string;
  prompt: string;
  aboutArtifact?: string;
  draft: boolean;
}

export interface ContributeResult {
  contributionId: string;
  effects: string[];
  draft: boolean;
}
