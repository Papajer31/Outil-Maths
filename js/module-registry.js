import { createMathsModuleRuntime } from "../modules/maths/module.js";

export function loadModuleRuntime(moduleKey) {
  const normalizedModuleKey = String(moduleKey || "").trim();

  if (normalizedModuleKey === "maths") {
    return createMathsModuleRuntime();
  }

  throw new Error(`Module inconnu : ${normalizedModuleKey}`);
}