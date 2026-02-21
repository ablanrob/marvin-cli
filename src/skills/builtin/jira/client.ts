export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  self: string;
  fields: {
    summary: string;
    description: string | null;
    status: { name: string };
    issuetype: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string; emailAddress: string } | null;
    labels: string[];
    created: string;
    updated: string;
    [key: string]: unknown;
  };
}

export interface JiraSearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraCreateResponse {
  id: string;
  key: string;
  self: string;
}

export class JiraClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: JiraConfig) {
    this.baseUrl = `https://${config.host}/rest/api/2`;
    this.authHeader =
      "Basic " + Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  private async request<T>(
    path: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Jira API error ${response.status} ${method} ${path}: ${text}`,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraSearchResult> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
    });
    return this.request<JiraSearchResult>(`/search?${params}`);
  }

  async getIssue(key: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(`/issue/${encodeURIComponent(key)}`);
  }

  async createIssue(fields: Record<string, unknown>): Promise<JiraCreateResponse> {
    return this.request<JiraCreateResponse>("/issue", "POST", { fields });
  }

  async updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
    await this.request<void>(
      `/issue/${encodeURIComponent(key)}`,
      "PUT",
      { fields },
    );
  }

  async addComment(key: string, body: string): Promise<void> {
    await this.request<void>(
      `/issue/${encodeURIComponent(key)}/comment`,
      "POST",
      { body },
    );
  }
}

export function createJiraClient(): JiraClient | null {
  const host = process.env.JIRA_HOST;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!host || !email || !apiToken) return null;

  return new JiraClient({ host, email, apiToken });
}
