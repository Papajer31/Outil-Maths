import * as config from "./config.js";
import { createActivity as createQuizActivity } from "./activity.js";
import { filterQuizSnapshotBySelection, normalizeSettings, normalizeQuizSnapshot } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

function getDefaultInstruction(settings = {}){
  const normalized = normalizeSettings(settings);
  return String(normalized.sourceInstruction || normalized.quizSnapshot?.instruction || "").trim();
}

export default defineTool("quiz", "Quiz", {
  version: "1",
  description: "Questions composées librement sur un canevas de widgets.",
  tags: ["quiz", "question", "reponse", "texte", "canevas", "projection"],
  defaultInstruction: "",
  supportsCustomInstruction: false,
  workAreaLayout: "stretch",

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}){
    return normalizeSettings(settings);
  },

  getIntrinsicQuestionCount(context = {}){
    const settings = normalizeSettings(context?.settings || {});
    const snapshot = normalizeQuizSnapshot(settings.quizSnapshot || {});

    // Une « série de questions » est un pool génératif : ses variantes restent
    // sélectionnables individuellement dans l’éditeur d’activité, mais leur
    // nombre ne constitue pas la longueur intrinsèque de la séance. Celle-ci
    // est fournie par le contexte (Exploration / Mission / Aventure).
    if (snapshot.editorMode === "series" || snapshot.seriesModelId) return null;

    // Un quiz classique reste fini : on joue le contenu sélectionné.
    return Math.max(1, filterQuizSnapshotBySelection(snapshot, settings.questionSelection).length);
  },

  getActivityModeProfile(){
    return {
      individual: { supported: true },
      group: { supported: true }
    };
  },

  getRuntimeCapabilities(){
    return {
      questionPhase: "required",
      answerPhase: "required",
      transitionPhase: "required",
      supportedAdvanceModes: ["auto", "user", "tool"],
      supportedTimingModes: ["engine"],
      supportsCommonFlowSettings: true
    };
  },

  createActivity(context = {}){
    const defaultInstruction = getDefaultInstruction(context?.settings);
    return createQuizActivity({
      ...context,
      defaultInstruction,
      supportsCustomInstruction: false
    });
  }
});
