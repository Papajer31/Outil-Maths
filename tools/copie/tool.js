import * as config from "./config.js";
import { createActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

export default defineTool("copie", "Copie", {
  version:"1",
  description:"Travailler la copie différée à partir d’un texte masqué, puis vérifier et relever ses données de copie.",
  tags:["français", "écriture", "copie", "mémorisation", "texte"],
  defaultInstruction:"",
  supportsCustomInstruction:false,
  workAreaLayout:"stretch",

  getDefaultSettings:config.getDefaultSettings,
  renderToolSettings:config.renderToolSettings,
  readToolSettings:config.readToolSettings,

  buildRuntimeConfig(settings = {}){
    return normalizeSettings(settings);
  },

  getIntrinsicQuestionCount(){
    return 1;
  },

  getActivityModeProfile(){
    return {
      individual:{ supported:true },
      group:{ supported:false, reason:"L’outil Copie enregistre des données individuelles de travail." },
      showCommonToolSettings:false
    };
  },

  getRuntimeCapabilities(){
    return {
      questionPhase:"required",
      answerPhase:"unsupported",
      transitionPhase:"supported",
      supportedAdvanceModes:["tool"],
      supportedTimingModes:["tool"],
      supportsCommonFlowSettings:false
    };
  },

  createActivity(context = {}){
    return createActivity(context);
  }
});
