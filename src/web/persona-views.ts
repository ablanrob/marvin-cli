export type DashboardPersona = "po" | "dm" | "tl" | null; // null = no persona selected

export interface PersonaNavItem {
  path: string;
  label: string;
}

export interface PersonaViewConfig {
  shortName: "po" | "dm" | "tl";
  displayName: string;
  description: string;
  color: string;
  navItems: PersonaNavItem[];
}

export type PersonaPageRenderer = (ctx: PersonaPageContext) => string;

export interface PersonaPageContext {
  store: import("../storage/store.js").DocumentStore;
  projectName: string;
  searchParams?: URLSearchParams;
  subPath?: string;
  persona?: string;
}

const VIEWS = new Map<string, PersonaViewConfig>();
const PAGE_RENDERERS = new Map<string, PersonaPageRenderer>();

export function registerPersonaView(config: PersonaViewConfig): void {
  VIEWS.set(config.shortName, config);
}

export function registerPersonaPage(
  persona: string,
  pageId: string,
  renderer: PersonaPageRenderer,
): void {
  PAGE_RENDERERS.set(`${persona}/${pageId}`, renderer);
}

export function getPersonaView(mode: DashboardPersona): PersonaViewConfig | undefined {
  if (!mode) return undefined;
  return VIEWS.get(mode);
}

export function getPersonaPageRenderer(
  persona: string,
  pageId: string,
): PersonaPageRenderer | undefined {
  return PAGE_RENDERERS.get(`${persona}/${pageId}`);
}

export function getAllPersonaViews(): PersonaViewConfig[] {
  return [...VIEWS.values()];
}

const VALID_PERSONAS = new Set(["po", "dm", "tl"]);

export function parsePersonaFromUrl(params: URLSearchParams): DashboardPersona {
  const value = params.get("persona")?.toLowerCase();
  if (value && VALID_PERSONAS.has(value)) return value as DashboardPersona;
  return null;
}

export function parsePersonaFromPath(pathname: string): DashboardPersona {
  const match = pathname.match(/^\/(po|dm|tl)(?:\/|$)/);
  return match ? (match[1] as DashboardPersona) : null;
}

/** Resolve persona from path first, then query params, defaulting to null. */
export function resolvePersona(
  pathname: string,
  params: URLSearchParams,
): DashboardPersona {
  return parsePersonaFromPath(pathname) ?? parsePersonaFromUrl(params);
}

export interface SharedNavItem {
  pageId: string;
  label: string;
}

export const SHARED_NAV_ITEMS: SharedNavItem[] = [
  { pageId: "timeline", label: "Timeline" },
  { pageId: "board", label: "Board" },
  { pageId: "upcoming", label: "Upcoming" },
  { pageId: "sprint-summary", label: "Sprint Summary" },
  { pageId: "gar", label: "GAR Report" },
  { pageId: "health", label: "Health" },
];
