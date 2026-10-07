import { describe, expect, it } from "vite-plus/test";
import {
  getSettingsFieldMetadata,
  SETTINGS_FIELD_METADATA,
  SETTINGS_GROUP_ORDER,
} from "./metadata.js";

describe("settings field metadata", () => {
  it("exposes the same list through the getter", () => {
    expect(getSettingsFieldMetadata()).toBe(SETTINGS_FIELD_METADATA);
    expect(SETTINGS_FIELD_METADATA.length).toBeGreaterThan(0);
  });

  it("has unique keys", () => {
    const keys = SETTINGS_FIELD_METADATA.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("assigns every field to a known group", () => {
    for (const field of SETTINGS_FIELD_METADATA) {
      expect(SETTINGS_GROUP_ORDER).toContain(field.group);
    }
  });

  it("gives every field a label, description and valid control", () => {
    for (const field of SETTINGS_FIELD_METADATA) {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.description.length).toBeGreaterThan(0);
      expect(["toggle", "select", "input", "json"]).toContain(field.control);
    }
  });

  it("gives select controls at least one option with a value and label", () => {
    const selects = SETTINGS_FIELD_METADATA.filter((field) => field.control === "select");
    expect(selects.length).toBeGreaterThan(0);
    for (const field of selects) {
      expect(field.options?.length ?? 0).toBeGreaterThan(0);
      for (const option of field.options ?? []) {
        expect(option.value).not.toBe("");
        expect(option.label).not.toBe("");
      }
    }
  });

  it("only attaches options to select controls", () => {
    for (const field of SETTINGS_FIELD_METADATA.filter((f) => f.control !== "select")) {
      expect(field.options).toBeUndefined();
    }
  });
});
