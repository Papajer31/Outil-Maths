import { createModuleRuntime } from "../../shared/module-factory.js";

export function createMathsModuleRuntime() {
  return createModuleRuntime({
    moduleKey: "maths",
    manifestUrl: new URL("./manifest.json", import.meta.url)
  });
}

export default createMathsModuleRuntime;
