import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatAnswerValue
} from "./model.js";
import { createOperationHoleActivity } from "../../shared/tool-commons/calcul/operation-hole-activity.js";

const OPERATION_HOLE_MODEL = Object.freeze({
  normalizeSettings,
  pickQuestion,
  questionKey,
  formatAnswerValue
});

export function createActivity(initialContext = {}) {
  return createOperationHoleActivity({
    model: OPERATION_HOLE_MODEL,
    initialContext
  });
}
