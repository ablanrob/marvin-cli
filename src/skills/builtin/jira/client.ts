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

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  version: { number: number; createdAt: string };
  body?: {
    atlas_doc_format?: {
      value: string;
    };
  };
  _links?: {
    webui?: string;
    base?: string;
  };
}

export class JiraClient {
  private baseUrl: string;
  private baseUrlV3: string;
  private confluenceBaseUrl: string;
  private authHeader: string;
  private host: string;

  constructor(config: JiraConfig) {
    // Normalize host: strip protocol prefix and trailing slashes
    this.host = config.host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.baseUrl = `https://${this.host}/rest/api/2`;
    this.baseUrlV3 = `https://${this.host}/rest/api/3`;
    this.confluenceBaseUrl = `https://${this.host}/wiki/api/v2`;
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  }

  private async request<T>(path: string, method: string = "GET", body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.doRequest<T>(url, method, body);
  }

  private async requestV3<T>(path: string, method: string = "GET", body?: unknown): Promise<T> {
    const url = `${this.baseUrlV3}${path}`;
    return this.doRequest<T>(url, method, body);
  }

  private async doRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
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
      throw new Error(`Jira API error ${response.status} ${method} ${url}: ${text}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraSearchResult> {
    return this.searchIssuesV3(
      jql,
      [
        "summary",
        "description",
        "status",
        "issuetype",
        "priority",
        "assignee",
        "labels",
        "created",
        "updated",
      ],
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
    await this.request<undefined>(`/issue/${encodeURIComponent(key)}`, "PUT", { fields });
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
    return this.request<JiraRemoteLink[]>(`/issue/${encodeURIComponent(key)}/remotelink`);
  }

  async addComment(key: string, body: string): Promise<void> {
    await this.request<undefined>(`/issue/${encodeURIComponent(key)}/comment`, "POST", { body });
  }

  // --- Confluence methods ---

  async getConfluencePage(pageId: string): Promise<ConfluencePage> {
    return this.doRequest<ConfluencePage>(
      `${this.confluenceBaseUrl}/pages/${encodeURIComponent(pageId)}?body-format=atlas_doc_format`,
      "GET",
    );
  }

  /**
   * Extract a Confluence page ID from various URL formats.
   * Returns null if the URL doesn't match any known pattern.
   */
  static extractPageId(url: string): string | null {
    // /pages/<id> or /pages/<id>/title
    const pagesMatch = url.match(/\/pages\/(\d+)/);
    if (pagesMatch) return pagesMatch[1];
    // ?pageId=<id>
    const paramMatch = url.match(/[?&]pageId=(\d+)/);
    if (paramMatch) return paramMatch[1];
    return null;
  }

  /**
   * Build a web URL for a Confluence page.
   */
  getConfluencePageUrl(pageId: string): string {
    return `https://${this.host}/wiki/pages/viewpage.action?pageId=${pageId}`;
  }
}

export interface ResolvedJiraConfig {
  client: JiraClient;
  host: string;
}

export interface JiraConfigSources {
  /** Project-level config (.marvin/config.yaml jira section) */
  project?: { host?: string; email?: string };
  /** User-level config (~/.config/marvin/config.yaml jira section) */
  user?: { host?: string; email?: string; apiToken?: string };
}

/**
 * Resolve Jira credentials from project config → user config → env vars.
 * Returns null if any required credential is missing.
 */
export function createJiraClient(
  userConfigOrSources?: JiraConfigSources["user"] | JiraConfigSources,
): ResolvedJiraConfig | null {
  // Support both legacy (user-only) and new (project+user) signatures
  const sources = isConfigSources(userConfigOrSources)
    ? userConfigOrSources
    : { user: userConfigOrSources };

  const host =
    sources.project?.host?.trim() ||
    sources.user?.host?.trim() ||
    process.env.JIRA_HOST?.trim() ||
    undefined;
  const email =
    sources.project?.email?.trim() ||
    sources.user?.email?.trim() ||
    process.env.JIRA_EMAIL?.trim() ||
    undefined;
  const apiToken =
    sources.user?.apiToken?.trim() || process.env.JIRA_API_TOKEN?.trim() || undefined;

  if (!host || !email || !apiToken) return null;

  const normalizedHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { client: new JiraClient({ host, email, apiToken }), host: normalizedHost };
}

/** Check which Jira credentials are present without exposing values. */
export function resolveJiraStatus(sources?: JiraConfigSources): {
  host: { configured: boolean; value?: string; source?: string };
  email: { configured: boolean; source?: string };
  apiToken: { configured: boolean; source?: string };
} {
  const projectHost = sources?.project?.host?.trim();
  const userHost = sources?.user?.host?.trim();
  const envHost = process.env.JIRA_HOST?.trim();
  const host = projectHost || userHost || envHost;

  const projectEmail = sources?.project?.email?.trim();
  const userEmail = sources?.user?.email?.trim();
  const envEmail = process.env.JIRA_EMAIL?.trim();

  const userToken = sources?.user?.apiToken?.trim();
  const envToken = process.env.JIRA_API_TOKEN?.trim();

  return {
    host: {
      configured: !!host,
      value: host ? host.replace(/^https?:\/\//, "").replace(/\/+$/, "") : undefined,
      source: projectHost ? "project" : userHost ? "user" : envHost ? "env" : undefined,
    },
    email: {
      configured: !!(projectEmail || userEmail || envEmail),
      source: projectEmail ? "project" : userEmail ? "user" : envEmail ? "env" : undefined,
    },
    apiToken: {
      configured: !!(userToken || envToken),
      source: userToken ? "user" : envToken ? "env" : undefined,
    },
  };
}

function isConfigSources(
  value: JiraConfigSources["user"] | JiraConfigSources | undefined,
): value is JiraConfigSources {
  if (!value) return false;
  return "project" in value || "user" in value;
}
