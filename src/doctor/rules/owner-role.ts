import type { DoctorRule, DoctorContext, DoctorIssue, DoctorFix } from "../types.js";
import { isValidOwner, OWNER_SHORT } from "../../personas/owner.js";

const RULE_ID = "owner-role";
const RULE_NAME = "Owner Role";

export const ownerRoleRule: DoctorRule = {
  id: RULE_ID,
  name: RULE_NAME,
  description:
    `Detects owner values that are not valid persona roles (${OWNER_SHORT.join(", ")})`,

  scan(ctx: DoctorContext): DoctorIssue[] {
    const issues: DoctorIssue[] = [];

    for (const doc of ctx.allDocuments) {
      const owner = doc.frontmatter.owner;
      if (owner === undefined || owner === null || owner === "") continue;

      if (!isValidOwner(owner)) {
        issues.push({
          ruleId: RULE_ID,
          ruleName: RULE_NAME,
          documentId: doc.frontmatter.id,
          filePath: doc.filePath,
          documentType: doc.frontmatter.type,
          message: `Owner "${owner}" is not a valid persona role. Expected one of: ${OWNER_SHORT.join(", ")}`,
          severity: "warning",
          fixable: false,
        });
      }
    }

    return issues;
  },

  fix(): DoctorFix[] {
    // Not auto-fixable — requires human judgment to determine the correct persona role
    return [];
  },
};
