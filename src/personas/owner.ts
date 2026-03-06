import { z } from "zod/v4";

/** Short-form persona role IDs used as canonical owner values */
export const OWNER_SHORT = ["po", "dm", "tl"] as const;

/** Long-form persona role IDs (accepted on input, normalized to short) */
export const OWNER_LONG = ["product-owner", "delivery-manager", "tech-lead"] as const;

/** All accepted owner input values */
export const VALID_OWNERS = [...OWNER_SHORT, ...OWNER_LONG] as const;

const LONG_TO_SHORT: Record<string, string> = {
  "product-owner": "po",
  "delivery-manager": "dm",
  "tech-lead": "tl",
};

/**
 * Zod schema for owner fields in tool definitions.
 * Accepts both short ("po") and long ("product-owner") forms.
 */
export const ownerSchema = z.enum(VALID_OWNERS);

/**
 * Normalize an owner value to its short form.
 * Returns undefined if the input is undefined.
 */
export function normalizeOwner(owner: string | undefined): string | undefined {
  if (owner === undefined) return undefined;
  return LONG_TO_SHORT[owner] ?? owner;
}

/**
 * Check whether a value is a valid persona-role owner.
 */
export function isValidOwner(value: string): boolean {
  return (VALID_OWNERS as readonly string[]).includes(value);
}
