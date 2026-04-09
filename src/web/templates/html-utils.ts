/**
 * Wrap a section title + content in a collapsible container.
 * `sectionId` is used as a localStorage key to persist open/closed state.
 * Sections default to expanded.
 */
export function collapsibleSection(
  sectionId: string,
  title: string,
  content: string,
  opts?: { titleTag?: string; titleClass?: string; defaultCollapsed?: boolean },
): string {
  const tag = opts?.titleTag ?? "div";
  const cls = opts?.titleClass ?? "section-title";
  const collapsed = opts?.defaultCollapsed ? " collapsed" : "";
  return `
    <div class="collapsible${collapsed}" data-section-id="${escapeHtml(sectionId)}">
      <${tag} class="${cls} collapsible-header" onclick="toggleSection(this)">
        <svg class="collapsible-chevron" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M4.94 5.72a.75.75 0 0 1 1.06-.02L8 7.56l1.97-1.84a.75.75 0 1 1 1.02 1.1l-2.5 2.34a.75.75 0 0 1-1.02 0l-2.5-2.34a.75.75 0 0 1-.03-1.06z"/>
        </svg>
        <span>${escapeHtml(title)}</span>
      </${tag}>
      <div class="collapsible-body">
        ${content}
      </div>
    </div>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBadge(status: string): string {
  const cls =
    {
      open: "badge-open",
      done: "badge-done",
      closed: "badge-done",
      resolved: "badge-resolved",
      decided: "badge-done",
      superseded: "badge-draft",
      dismissed: "badge-draft",
      "in-progress": "badge-in-progress",
      "in progress": "badge-in-progress",
      draft: "badge-draft",
      blocked: "badge-blocked",
      cancelled: "badge-done",
    }[status.toLowerCase()] ?? "badge-default";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function typeLabel(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Official Jira mark SVG (blue gradient)
const JIRA_SVG = `<svg class="integration-icon" viewBox="0 0 256 256" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="jg1" x1="98.03%" y1="0.16%" x2="58.89%" y2="40.87%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient><linearGradient id="jg2" x1="100.17%" y1="0.05%" x2="55.76%" y2="45.19%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient></defs><path d="M244.658 0H121.707a55.502 55.502 0 0 0 55.502 55.502h22.649V77.37c.02 30.625 24.841 55.447 55.466 55.502V10.666C255.324 4.777 250.55 0 244.658 0z" fill="#2684FF"/><path d="M183.822 61.262H60.872c.019 30.625 24.84 55.447 55.466 55.502h22.649v21.868c.02 30.597 24.798 55.408 55.395 55.502V71.928c0-5.891-4.776-10.666-10.56-10.666z" fill="url(#jg1)"/><path d="M122.951 122.489H0c0 30.653 24.85 55.502 55.502 55.502h22.72v21.868c.02 30.597 24.798 55.408 55.396 55.502V133.155c0-5.891-4.776-10.666-10.667-10.666z" fill="url(#jg2)"/></svg>`;

// Official Confluence mark SVG (blue gradient)
const CONFLUENCE_SVG = `<svg class="integration-icon" viewBox="0 0 256 246" width="14" height="14" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="cg1" x1="99.14%" y1="113.9%" x2="33.86%" y2="37.96%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient><linearGradient id="cg2" x1="0.86%" y1="-13.9%" x2="66.14%" y2="62.04%"><stop offset="18%" stop-color="#0052CC"/><stop offset="100%" stop-color="#2684FF"/></linearGradient></defs><path d="M9.26 187.28c-3.14 5.06-6.71 10.98-9.26 15.53a7.84 7.84 0 0 0 2.83 10.72l67.58 40.48a7.85 7.85 0 0 0 10.72-2.63c2.14-3.54 5.01-8.25 8.15-13.41 22.18-36.47 44.67-32.02 85.83-13.41l68.59 31.05a7.85 7.85 0 0 0 10.42-3.94l29.24-66.24a7.85 7.85 0 0 0-3.84-10.32c-20.53-9.27-61.49-27.75-87.33-39.45-72.2-32.73-133.87-30.05-182.93 51.62z" fill="url(#cg1)"/><path d="M246.11 58.24c3.14-5.06 6.71-10.98 9.26-15.53a7.84 7.84 0 0 0-2.83-10.72L184.96 0a7.85 7.85 0 0 0-10.72 2.63c-2.14 3.54-5.01 8.25-8.15 13.41-22.18 36.47-44.67 32.02-85.83 13.41L12.37 -1.6a7.85 7.85 0 0 0-10.42 3.94L-27.29 68.58a7.85 7.85 0 0 0 3.84 10.32c20.53 9.27 61.49 27.75 87.33 39.45 72.2 32.73 133.87 30.05 182.23-60.11z" fill="url(#cg2)"/></svg>`;

/**
 * Render an inline Jira icon linking to the issue.
 * Returns empty string if no jiraKey provided.
 */
export function jiraIcon(jiraKey?: string, jiraUrl?: string): string {
  if (!jiraKey) return "";
  const href = jiraUrl ?? "#";
  const title = escapeHtml(jiraKey);
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" title="Jira: ${title}" class="integration-link jira-link">${JIRA_SVG}</a>`;
}

/**
 * Render an inline Confluence icon linking to the page.
 * Returns empty string if no confluenceUrl provided.
 */
export function confluenceIcon(confluenceUrl?: string, confluenceTitle?: string): string {
  if (!confluenceUrl) return "";
  const title = confluenceTitle ? escapeHtml(confluenceTitle) : "Confluence";
  return `<a href="${escapeHtml(confluenceUrl)}" target="_blank" rel="noopener" title="${title}" class="integration-link confluence-link">${CONFLUENCE_SVG}</a>`;
}

/**
 * Render all integration icons for an artifact (Jira + Confluence).
 */
function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function integrationIcons(frontmatter: Record<string, unknown>): string {
  const jira = jiraIcon(
    toStringOrUndefined(frontmatter.jiraKey),
    toStringOrUndefined(frontmatter.jiraUrl),
  );
  const confluence = confluenceIcon(
    toStringOrUndefined(frontmatter.confluenceUrl),
    toStringOrUndefined(frontmatter.confluenceTitle),
  );
  if (!jira && !confluence) return "";
  return `<span class="integration-icons">${jira}${confluence}</span>`;
}
