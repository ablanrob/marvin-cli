import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocumentStore } from "../../../src/storage/store.js";
import { createMeetingTools } from "../../../src/plugins/builtin/tools/meetings.js";
import { COMMON_REGISTRATIONS } from "../../../src/plugins/common.js";

describe("Meeting Tools", () => {
  let tmpDir: string;
  let marvinDir: string;
  let store: DocumentStore;
  let tools: Record<string, (args: any) => Promise<any>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marvin-test-"));
    marvinDir = path.join(tmpDir, ".marvin");
    for (const dir of ["decisions", "actions", "questions", "meetings", "reports", "features", "epics"]) {
      fs.mkdirSync(path.join(marvinDir, "docs", dir), { recursive: true });
    }
    store = new DocumentStore(marvinDir, COMMON_REGISTRATIONS);

    const meetingTools = createMeetingTools(store);
    tools = {};
    for (const t of meetingTools) {
      tools[t.name] = (t as any).handler;
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a meeting and get it by ID", async () => {
    const createResult = await tools.create_meeting({
      title: "Sprint Planning",
      content: "Plan the next sprint.",
      attendees: ["alice", "bob"],
      date: "2026-02-15",
    });
    expect(createResult.content[0].text).toContain("M-001");
    expect(createResult.content[0].text).toContain("Sprint Planning");

    const getResult = await tools.get_meeting({ id: "M-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.title).toBe("Sprint Planning");
    expect(data.status).toBe("scheduled");
    expect(data.attendees).toEqual(["alice", "bob"]);
  });

  it("should list meetings", async () => {
    await tools.create_meeting({ title: "Standup", content: "Daily standup." });
    await tools.create_meeting({
      title: "Retro",
      content: "Sprint retro.",
      status: "completed",
    });

    const listResult = await tools.list_meetings({});
    const list = JSON.parse(listResult.content[0].text);
    expect(list).toHaveLength(2);

    const filteredResult = await tools.list_meetings({ status: "completed" });
    const filtered = JSON.parse(filteredResult.content[0].text);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Retro");
  });

  it("should update a meeting", async () => {
    await tools.create_meeting({ title: "Planning", content: "Plan." });

    const updateResult = await tools.update_meeting({
      id: "M-001",
      status: "completed",
      content: "Planning done. Decided on sprint scope.",
    });
    expect(updateResult.content[0].text).toContain("Updated meeting M-001");

    const getResult = await tools.get_meeting({ id: "M-001" });
    const data = JSON.parse(getResult.content[0].text);
    expect(data.status).toBe("completed");
    expect(data.content).toContain("Planning done");
  });

  it("should return error for non-existent meeting", async () => {
    const result = await tools.get_meeting({ id: "M-999" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});
