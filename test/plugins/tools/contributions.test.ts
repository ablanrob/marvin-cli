import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createContributionTools } from "../../../src/plugins/builtin/tools/contributions.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Contribution Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics", "contributions"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const contributionTools = createContributionTools(store);
    tools = {};
    for (const t of contributionTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a contribution and get it by ID", async () => {
    const createResult = await tools.create_contribution({
      title: "Action A-001 Complete",
      content: "A-001 is done with 30% improvement.",
      persona: "tech-lead",
      contributionType: "action-result",
      aboutArtifact: "A-001",
    });
    expect(createResult.content[0].text).toContain("C-001");
    expect(createResult.content[0].text).toContain("Action A-001 Complete");

    const getResult = await tools.get_contribution({ id: "C-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.title).toBe("Action A-001 Complete");
    expect(data.persona).toBe("tech-lead");
    expect(data.contributionType).toBe("action-result");
    expect(data.aboutArtifact).toBe("A-001");
    expect(data.status).toBe("done");
  });

  it("should list contributions and filter by persona", async () => {
    await tools.create_contribution({
      title: "TL Contribution",
      content: "From TL.",
      persona: "tech-lead",
      contributionType: "action-result",
    });
    await tools.create_contribution({
      title: "DM Contribution",
      content: "From DM.",
      persona: "delivery-manager",
      contributionType: "risk-finding",
    });

    const allResult = await tools.list_contributions({});
    const all = JSON.parse(allResult.content[0].text);
    expect(all).toHaveLength(2);

    const filteredResult = await tools.list_contributions({ persona: "tech-lead" });
    const filtered = JSON.parse(filteredResult.content[0].text);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("TL Contribution");
  });

  it("should filter contributions by contribution type", async () => {
    await tools.create_contribution({
      title: "Risk 1",
      content: "A risk.",
      persona: "delivery-manager",
      contributionType: "risk-finding",
    });
    await tools.create_contribution({
      title: "Blocker 1",
      content: "A blocker.",
      persona: "delivery-manager",
      contributionType: "blocker-report",
    });

    const result = await tools.list_contributions({ contributionType: "risk-finding" });
    const list = JSON.parse(result.content[0].text);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Risk 1");
  });

  it("should update a contribution", async () => {
    await tools.create_contribution({
      title: "My Contribution",
      content: "Initial content.",
      persona: "tech-lead",
      contributionType: "spike-findings",
    });

    const updateResult = await tools.update_contribution({
      id: "C-001",
      status: "processed",
      content: "Initial content.\n\n## Effects\n- D-001: New decision",
    });
    expect(updateResult.content[0].text).toContain("Updated contribution C-001");

    const getResult = await tools.get_contribution({ id: "C-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.status).toBe("processed");
    expect(data.content).toContain("Effects");
  });

  it("should return error for non-existent contribution", async () => {
    const result = await tools.get_contribution({ id: "C-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("should filter by status", async () => {
    await tools.create_contribution({
      title: "Open",
      content: "Open one.",
      persona: "tech-lead",
      contributionType: "action-result",
    });
    await tools.create_contribution({
      title: "Processed",
      content: "Done one.",
      persona: "tech-lead",
      contributionType: "action-result",
      status: "processed",
    });

    const result = await tools.list_contributions({ status: "processed" });
    const list = JSON.parse(result.content[0].text);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Processed");
  });
});
