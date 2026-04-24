import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createDiscoveryTools } from "../../../src/plugins/builtin/tools/discoveries.js";
import { createFeatureTools } from "../../../src/plugins/builtin/tools/features.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Discovery Tools", () => {
  let tmpDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;
  let featureTools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    const marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of [
      "decisions",
      "actions",
      "questions",
      "meetings",
      "reports",
      "features",
      "epics",
      "contributions",
      "sprints",
      "tasks",
      "discoveries",
    ]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    tools = {};
    for (const t of createDiscoveryTools(store)) {
      tools[t.name] = (t as any).handler;
    }
    featureTools = {};
    for (const t of createFeatureTools(store)) {
      featureTools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // start_discovery
  // -------------------------------------------------------------------------
  describe("start_discovery", () => {
    it("should create DS-001 with default draft status and frontmatter fields", async () => {
      const result = await tools.start_discovery({
        title: "Requirements Review",
        content: "Discuss payment flow",
        stakeholder: "Finance Team",
      });
      expect(result.content[0].text).toContain("DS-001");
      expect(result.content[0].text).toContain("session 1");

      const doc = store.get("DS-001");
      expect(doc).toBeDefined();
      expect(doc!.frontmatter.type).toBe("discovery");
      expect(doc!.frontmatter.status).toBe("draft");
      expect(doc!.frontmatter.stakeholder).toBe("Finance Team");
      expect(doc!.frontmatter.session).toBe(1);
    });

    it("should carry forward open gaps from parent and set session to N+1", async () => {
      // Create parent with gaps
      await tools.start_discovery({
        title: "Session 1",
        content: "Initial session",
        stakeholder: "Product Team",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "What about edge cases?",
        area: "product",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "Performance requirements?",
        area: "technical",
      });
      // Resolve one gap
      await tools.complete_discovery({ id: "DS-001" });
      // We need the DS to be in a state with open gaps - let's work with content directly
      // The gaps are still in content as open since we didn't resolve them

      const result = await tools.start_discovery({
        title: "Session 2",
        content: "Follow-up session",
        stakeholder: "Product Team",
        parent: "DS-001",
      });

      expect(result.content[0].text).toContain("DS-002");
      expect(result.content[0].text).toContain("session 2");

      const doc = store.get("DS-002");
      expect(doc!.frontmatter.session).toBe(2);
      expect(doc!.frontmatter.parent).toBe("DS-001");
      // Open gaps should be carried forward
      expect(doc!.content).toContain("Open Gaps from DS-001");
      expect(doc!.content).toContain("What about edge cases?");
    });

    it("should auto-load context from tagged features into content", async () => {
      await featureTools.create_feature({
        title: "Payment Flow",
        content: "Handle payments",
        tags: ["payments"],
      });

      const result = await tools.start_discovery({
        title: "Payment Discovery",
        content: "Discuss payment requirements",
        stakeholder: "Finance",
        tags: ["payments"],
      });

      expect(result.content[0].text).toContain("DS-001");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("Prior Context");
      expect(doc!.content).toContain("F-001");
      expect(doc!.content).toContain("Payment Flow");
    });

    it("should return error when parent not found", async () => {
      const result = await tools.start_discovery({
        title: "Follow-up",
        content: "Content",
        stakeholder: "Team",
        parent: "DS-999",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  // -------------------------------------------------------------------------
  // record_finding
  // -------------------------------------------------------------------------
  describe("record_finding", () => {
    it("should append F-1 block with source/impacts/confidence", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.record_finding({
        id: "DS-001",
        finding: "Users need SSO",
        source: "Stakeholder interview",
        impacts: "Authentication module",
        confidence: "high",
      });

      expect(result.content[0].text).toContain("F-1");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("### F-1: Users need SSO");
      expect(doc!.content).toContain("**Source:** Stakeholder interview");
      expect(doc!.content).toContain("**Impacts:** Authentication module");
      expect(doc!.content).toContain("**Confidence:** high");
    });

    it("should increment to F-2 on second call", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.record_finding({
        id: "DS-001",
        finding: "Finding one",
        source: "Interview",
        impacts: "Scope",
        confidence: "high",
      });
      const result = await tools.record_finding({
        id: "DS-001",
        finding: "Finding two",
        source: "Document review",
        impacts: "Architecture",
        confidence: "medium",
      });

      expect(result.content[0].text).toContain("F-2");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("### F-1: Finding one");
      expect(doc!.content).toContain("### F-2: Finding two");
    });

    it("should return error for non-existent discovery", async () => {
      const result = await tools.record_finding({
        id: "DS-999",
        finding: "Test",
        source: "Test",
        impacts: "Test",
        confidence: "high",
      });
      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // record_gap
  // -------------------------------------------------------------------------
  describe("record_gap", () => {
    it("should append GAP-1 with area and question", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.record_gap({
        id: "DS-001",
        question: "What about mobile?",
        area: "product",
      });

      expect(result.content[0].text).toContain("GAP-1");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("### GAP-1: What about mobile?");
      expect(doc!.content).toContain("**Area:** product");
      expect(doc!.content).toContain("**Status:** open");
    });

    it("should spawn Q-xxx with discovery tag when spawn_question is true", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.record_gap({
        id: "DS-001",
        question: "What is the SLA?",
        area: "technical",
        spawn_question: true,
      });

      expect(result.content[0].text).toContain("GAP-1");
      expect(result.content[0].text).toContain("Q-001");
      expect(result.content[0].text).toContain("discovery:DS-001");

      const q = store.get("Q-001");
      expect(q).toBeDefined();
      expect(q!.frontmatter.status).toBe("open");
      expect(q!.frontmatter.tags).toContain("discovery:DS-001");
      expect(q!.frontmatter.source).toBe("DS-001/GAP-1");
    });
  });

  // -------------------------------------------------------------------------
  // complete_discovery
  // -------------------------------------------------------------------------
  describe("complete_discovery", () => {
    it("should transition to in-review and append summary", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.record_finding({
        id: "DS-001",
        finding: "Finding 1",
        source: "Interview",
        impacts: "Scope",
        confidence: "high",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "Open question",
        area: "product",
      });

      const result = await tools.complete_discovery({ id: "DS-001" });

      expect(result.content[0].text).toContain("1 finding(s)");
      expect(result.content[0].text).toContain("1 gap(s)");
      expect(result.content[0].text).toContain("in-review");

      const doc = store.get("DS-001");
      expect(doc!.frontmatter.status).toBe("in-review");
      expect(doc!.content).toContain("## Session Summary");
      expect(doc!.content).toContain("**Findings:** 1");
      expect(doc!.content).toContain("**Gaps:** 1");
    });

    it("should error on wrong status (already in-review)", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.complete_discovery({ id: "DS-001" });

      const result = await tools.complete_discovery({ id: "DS-001" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("in-review");
    });
  });

  // -------------------------------------------------------------------------
  // list_discoveries
  // -------------------------------------------------------------------------
  describe("list_discoveries", () => {
    beforeEach(async () => {
      await tools.start_discovery({
        title: "Session A",
        content: "A",
        stakeholder: "Finance",
      });
      await tools.start_discovery({
        title: "Session B",
        content: "B",
        stakeholder: "HR",
      });
      await tools.complete_discovery({ id: "DS-001" });
    });

    it("should return all discoveries", async () => {
      const result = await tools.list_discoveries({});
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(2);
    });

    it("should filter by status", async () => {
      const result = await tools.list_discoveries({ status: "draft" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe("Session B");
    });

    it("should filter by stakeholder", async () => {
      const result = await tools.list_discoveries({ stakeholder: "HR" });
      const list = JSON.parse(result.content[0].text);
      expect(list).toHaveLength(1);
      expect(list[0].stakeholder).toBe("HR");
    });
  });

  // -------------------------------------------------------------------------
  // get_discovery
  // -------------------------------------------------------------------------
  describe("get_discovery", () => {
    it("should return full content", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Full content here",
        stakeholder: "Team",
      });

      const result = await tools.get_discovery({ id: "DS-001" });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Session");
      expect(data.content).toContain("Full content here");
    });

    it("should return error for non-existent", async () => {
      const result = await tools.get_discovery({ id: "DS-999" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  // -------------------------------------------------------------------------
  // add_discovery_review
  // -------------------------------------------------------------------------
  describe("add_discovery_review", () => {
    it("should append review annotation with reviewer and target", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.complete_discovery({ id: "DS-001" });

      const result = await tools.add_discovery_review({
        id: "DS-001",
        reviewer: "TL",
        target: "F-1",
        comment: "Looks feasible",
      });

      expect(result.content[0].text).toContain("Added review by TL");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("### Review [TL] on F-1");
      expect(doc!.content).toContain("Looks feasible");
    });

    it("should error when not in-review", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.add_discovery_review({
        id: "DS-001",
        reviewer: "TL",
        target: "F-1",
        comment: "Comment",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("draft");
    });
  });

  // -------------------------------------------------------------------------
  // resolve_gap
  // -------------------------------------------------------------------------
  describe("resolve_gap", () => {
    it("should change gap status to resolved and append rationale", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "What about auth?",
        area: "technical",
      });

      const result = await tools.resolve_gap({
        id: "DS-001",
        gap_number: 1,
        rationale: "Will use OAuth2",
      });

      expect(result.content[0].text).toContain("Resolved GAP-1");
      const doc = store.get("DS-001");
      expect(doc!.content).toContain("**Status:** resolved");
      expect(doc!.content).toContain("**Resolution:** Will use OAuth2");
      expect(doc!.content).not.toContain("**Status:** open");
    });

    it("should also update spawned Q-xxx to answered", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "What about auth?",
        area: "technical",
        spawn_question: true,
      });

      const result = await tools.resolve_gap({
        id: "DS-001",
        gap_number: 1,
        rationale: "OAuth2",
      });

      expect(result.content[0].text).toContain("Updated Q-001 to answered");
      const q = store.get("Q-001");
      expect(q!.frontmatter.status).toBe("answered");
    });

    it("should return error for non-existent gap", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.resolve_gap({
        id: "DS-001",
        gap_number: 5,
        rationale: "N/A",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("GAP-5 not found");
    });
  });

  // -------------------------------------------------------------------------
  // request_followup
  // -------------------------------------------------------------------------
  describe("request_followup", () => {
    it("should transition to needs-input and append follow-up section", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });
      await tools.record_gap({
        id: "DS-001",
        question: "Open item",
        area: "product",
      });
      await tools.complete_discovery({ id: "DS-001" });

      const result = await tools.request_followup({
        id: "DS-001",
        reason: "Need more stakeholder input",
      });

      expect(result.content[0].text).toContain("needs-input");
      expect(result.content[0].text).toContain("1 unresolved gap(s)");

      const doc = store.get("DS-001");
      expect(doc!.frontmatter.status).toBe("needs-input");
      expect(doc!.content).toContain("## Follow-up Requested");
      expect(doc!.content).toContain("Need more stakeholder input");
      expect(doc!.content).toContain("Open item");
    });

    it("should error when not in-review", async () => {
      await tools.start_discovery({
        title: "Session",
        content: "Agenda",
        stakeholder: "Team",
      });

      const result = await tools.request_followup({
        id: "DS-001",
        reason: "Need input",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("draft");
    });
  });
});
