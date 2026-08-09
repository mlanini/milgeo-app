import type { TFunction } from "i18next";

/**
 * Maps an attribute-form validation error to a UI message.
 */
export function attributeFormErrorMessage(
  _t: TFunction,
  error: { message?: string } | string,
): string {
  if (typeof error === "string") return error;
  return error.message ?? "Invalid value";
}
