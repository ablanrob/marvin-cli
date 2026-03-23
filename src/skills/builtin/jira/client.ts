export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
}

export interface JiraLinkedIssueFields {
  summary: string;
  status: { name: string };
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
    subtasks?: { key: string; fields: JiraLinkedIssueFields }[];
    issuelinks?: {
      type: { name: string; inward: string; outward: string };
      inwardIssue?: { key: string; fields: JiraLinkedIssueFields };
      outwardIssue?: { key: string; fields: JiraLinkedIssueFields };
    }[];
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

export interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

export interface JiraChangelogEntry {
  id: string;
  author: { displayName: string };
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraChangelog {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraChangelogEntry[];
}

export interface JiraComment {
  id: string;
  author: { displayName: string };
  body: unknown;
  created: string;
  updated: string;
}

export interface JiraCommentsResult {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

export interface JiraRemoteLink {
  id: number;
  self: string;
  object: {
    url: string;
    title: string;
    icon?: { url16x16: string; title: string };
  };
}

export class JiraClient {
  private baseUrl: string;
  private baseUrlV3: string;
  private authHeader: string;

  constructor(config: JiraConfig) {
    // Normalize host: strip protocol prefix and trailing slashes
    const host = config.host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.baseUrl = `https://${host}/rest/api/2`;
    this.baseUrlV3 = `https://${host}/rest/api/3`;
    this.authHeader =
      "Basic " + Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  private async request<T>(
    path: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.doRequest<T>(url, method, body);
  }

  private async requestV3<T>(
    path: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrlV3}${path}`;
    return this.doRequest<T>(url, method, body);
  }

  private async doRequest<T>(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
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
        `Jira API error ${response.status} ${method} ${url}: ${text}`,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraSearchResult> {
    return this.searchIssuesV3(
      jql,
      ["summary", "description", "status", "issuetype", "priority", "assignee", "labels", "created", "updated"],
      maxResults,
    );
  }

  async searchIssuesV3(
    jql: string,
    fields: string[] = ["summary", "status", "issuetype", "priority", "assignee", "labels"],
    maxResults: number = 50,
  ): Promise<JiraSearchResult> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: fields.join(","),
    });
    return this.requestV3<JiraSearchResult>(`/search/jql?${params}`);
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

  async getIssueWithLinks(key: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,priority,assignee,labels,subtasks,issuelinks`,
    );
  }

  async getChangelog(key: string): Promise<JiraChangelogEntry[]> {
    const result = await this.request<JiraChangelog>(
      `/issue/${encodeURIComponent(key)}/changelog?maxResults=100`,
    );
    return result.values;
  }

  async getComments(key: string): Promise<JiraComment[]> {
    const result = await this.request<JiraCommentsResult>(
      `/issue/${encodeURIComponent(key)}/comment?maxResults=100`,
    );
    return result.comments;
  }

  async getRemoteLinks(key: string): Promise<JiraRemoteLink[]> {
    return this.request<JiraRemoteLink[]>(
      `/issue/${encodeURIComponent(key)}/remotelink`,
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

export interface ResolvedJiraConfig {
  client: JiraClient;
  host: string;
}

export function createJiraClient(jiraUserConfig?: { host?: string; email?: string; apiToken?: string }): ResolvedJiraConfig | null {
  const host = jiraUserConfig?.host ?? process.env.JIRA_HOST;
  const email = jiraUserConfig?.email ?? process.env.JIRA_EMAIL;
  const apiToken = jiraUserConfig?.apiToken ?? process.env.JIRA_API_TOKEN;

  if (!host || !email || !apiToken) return null;

  // Normalize host for consistent jiraUrl generation
  const normalizedHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { client: new JiraClient({ host, email, apiToken }), host: normalizedHost };
}
