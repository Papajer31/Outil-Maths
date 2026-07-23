import { createDecimalRepresentationActivity } from "../../shared/tool-commons/decimal-representation/activity-core.js";
import {
  normalizeSettings,
  pickQuestion,
  questionKey,
  renderRepresentationSvg,
  renderRepresentationPieceSvg,
  REPRESENTATION_DIRECTIONS,
  DISPLAY_MODES
} from "./model.js";

export const createActivity = createDecimalRepresentationActivity({
  normalizeSettings,
  pickQuestion,
  questionKey,
  renderRepresentationSvg,
  renderRepresentationPieceSvg,
  REPRESENTATION_DIRECTIONS,
  DISPLAY_MODES,
  activityCssUrl: new URL("./activity.css", import.meta.url).href,
  blueHundredRowsCentered: false
});
