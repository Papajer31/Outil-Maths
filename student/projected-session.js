import { studentState } from "./student-state.js";

export function closeProjectedWindow(){
  studentState.sessionMode = "student";
  studentState.projectedSession = null;

  try {
    window.__allowProjectedUnload = true;
    window.close();
  } catch {}

  if (!window.closed) {
    window.location.hash = "#/home";
  }
}
