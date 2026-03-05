import { getAllPersonaViews } from "../../persona-views.js";
import { escapeHtml } from "../layout.js";

export function personaPickerPage(): string {
  const views = getAllPersonaViews();

  const cards = views
    .map(
      (v) => `
      <a href="/${v.shortName}/dashboard" class="persona-picker-card" style="--persona-card-accent: ${v.color}">
        <div class="persona-picker-name">${escapeHtml(v.displayName)}</div>
        <div class="persona-picker-desc">${escapeHtml(v.description)}</div>
      </a>`,
    )
    .join("\n");

  return `
    <div class="persona-picker">
      <h2>Choose Your View</h2>
      <p class="persona-picker-subtitle">Select a role to see a curated dashboard with the pages most relevant to you.</p>
      <div class="persona-picker-grid">
        ${cards}
      </div>
    </div>`;
}
