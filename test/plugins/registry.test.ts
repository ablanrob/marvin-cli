import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolvePlugin,
  getPluginTools,
  getPluginPromptFragment,
} from "../../src/plugins/registry.js";
import { DocumentStore } from "../../src/storage/store.js";
import { COMMON_REGISTRATIONS } from "../../src/plugins/common.js";
import type { DocumentTypeRegistration } from "../../src/storage/types.js";

const AEM_REGISTRATIONS: DocumentTypeRegistration[] = [
  ...COMMON_REGISTRATIONS,
  { type: "use-case", dirName: "use-cases", idPrefix: "UC" },
  { type: "tech-assessment", dirName: "tech-assessments", idPrefix: "TA" },
  { type: "extension-design", dirName: "extension-designs", idPrefix: "XD" },
];

describe("resolvePlugin", () => {
  it("should resolve generic-agile plugin", () => {
    const plugin = resolvePlugin("generic-agile");
    expect(plugin).toBeDefined();
    expect(plugin!.id).toBe("generic-agile");
    expect(plugin!.name).toBe("Generic Agile");
  });

  it("should resolve sap-aem plugin", () => {
    const plugin = resolvePlugin("sap-aem");
    expect(plugin).toBeDefined();
    expect(plugin!.id).toBe("sap-aem");
    expect(plugin!.name).toBe("SAP Application Extension Methodology");
  });

  it("should return undefined for unknown methodology", () => {
    expect(resolvePlugin("unknown")).toBeUndefined();
  });

  it("should return undefined when no methodology provided", () => {
    expect(resolvePlugin(undefined)).toBeUndefined();
  });
});

describe("getPluginTools", () => {
  it("should return generic-agile tools with expected names", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });

    try {
      const store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);
      const plugin = resolvePlugin("generic-agile")!;
      const tools = getPluginTools(plugin, store);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_meetings");
      expect(toolNames).toContain("get_meeting");
      expect(toolNames).toContain("create_meeting");
      expect(toolNames).toContain("update_meeting");
      expect(toolNames).toContain("analyze_meeting");
      expect(toolNames).toContain("generate_status_report");
      expect(toolNames).toContain("generate_risk_register");
      expect(toolNames).toContain("generate_gar_report");
      expect(toolNames).toContain("generate_epic_progress");
      expect(toolNames).toContain("generate_feature_progress");
      expect(toolNames).toContain("save_report");
      expect(toolNames).toContain("list_features");
      expect(toolNames).toContain("get_feature");
      expect(toolNames).toContain("create_feature");
      expect(toolNames).toContain("update_feature");
      expect(toolNames).toContain("list_epics");
      expect(toolNames).toContain("get_epic");
      expect(toolNames).toContain("create_epic");
      expect(toolNames).toContain("update_epic");
      expect(tools).toHaveLength(19);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should return sap-aem tools including common + AEM-specific", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    fs.mkdirSync(path.join(marvinDir, "docs"), { recursive: true });

    try {
      const store = new DocumentStore(marvinDir, AEM_REGISTRATIONS);
      const plugin = resolvePlugin("sap-aem")!;
      const tools = getPluginTools(plugin, store, marvinDir);

      const toolNames = tools.map((t) => t.name);

      // Common tools
      expect(toolNames).toContain("list_meetings");
      expect(toolNames).toContain("list_features");
      expect(toolNames).toContain("list_epics");
      expect(toolNames).toContain("generate_status_report");

      // AEM-specific tools
      expect(toolNames).toContain("list_use_cases");
      expect(toolNames).toContain("get_use_case");
      expect(toolNames).toContain("create_use_case");
      expect(toolNames).toContain("update_use_case");
      expect(toolNames).toContain("list_tech_assessments");
      expect(toolNames).toContain("get_tech_assessment");
      expect(toolNames).toContain("create_tech_assessment");
      expect(toolNames).toContain("update_tech_assessment");
      expect(toolNames).toContain("list_extension_designs");
      expect(toolNames).toContain("get_extension_design");
      expect(toolNames).toContain("create_extension_design");
      expect(toolNames).toContain("update_extension_design");
      expect(toolNames).toContain("generate_extension_portfolio");
      expect(toolNames).toContain("generate_tech_readiness");
      expect(toolNames).toContain("generate_phase_status");
      expect(toolNames).toContain("get_current_phase");
      expect(toolNames).toContain("advance_phase");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("getPluginPromptFragment", () => {
  it("should return DM-specific fragment for delivery-manager", () => {
    const plugin = resolvePlugin("generic-agile")!;
    const fragment = getPluginPromptFragment(plugin, "delivery-manager");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("generate_status_report");
    expect(fragment).toContain("generate_risk_register");
    expect(fragment).toContain("generate_feature_progress");
  });

  it("should return PO-specific fragment for product-owner", () => {
    const plugin = resolvePlugin("generic-agile")!;
    const fragment = getPluginPromptFragment(plugin, "product-owner");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("create_feature");
    expect(fragment).toContain("list_meetings");
    expect(fragment).not.toContain("generate_status_report");
  });

  it("should return TL-specific fragment for tech-lead", () => {
    const plugin = resolvePlugin("generic-agile")!;
    const fragment = getPluginPromptFragment(plugin, "tech-lead");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("create_epic");
    expect(fragment).toContain("list_features");
  });

  it("should fall back to wildcard for unknown personas", () => {
    const plugin = resolvePlugin("generic-agile")!;
    const fragment = getPluginPromptFragment(plugin, "unknown-persona");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("Features");
    expect(fragment).toContain("Epics");
  });

  it("should return undefined when plugin has no prompt fragments", () => {
    const fragment = getPluginPromptFragment(
      { id: "test", name: "Test", description: "test", version: "0.0.0" },
      "any",
    );
    expect(fragment).toBeUndefined();
  });

  it("should return AEM PO fragment with use case guidance", () => {
    const plugin = resolvePlugin("sap-aem")!;
    const fragment = getPluginPromptFragment(plugin, "product-owner");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("create_use_case");
    expect(fragment).toContain("Business Process Owner");
  });

  it("should return AEM TL fragment with tech assessment guidance", () => {
    const plugin = resolvePlugin("sap-aem")!;
    const fragment = getPluginPromptFragment(plugin, "tech-lead");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("create_tech_assessment");
    expect(fragment).toContain("create_extension_design");
    expect(fragment).toContain("Solution Architect");
  });

  it("should return AEM DM fragment with phase management", () => {
    const plugin = resolvePlugin("sap-aem")!;
    const fragment = getPluginPromptFragment(plugin, "delivery-manager");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("get_current_phase");
    expect(fragment).toContain("advance_phase");
    expect(fragment).toContain("generate_extension_portfolio");
  });

  it("should return AEM wildcard fragment for unknown personas", () => {
    const plugin = resolvePlugin("sap-aem")!;
    const fragment = getPluginPromptFragment(plugin, "unknown-persona");
    expect(fragment).toBeDefined();
    expect(fragment).toContain("SAP Application Extension Methodology");
    expect(fragment).toContain("Use Cases");
    expect(fragment).toContain("Tech Assessments");
  });
});
