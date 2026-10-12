import { registerTujerCreationType } from "./registry.js";
import { normalizeLabelsState } from "../teacher-tools/apps/labels/model.js";
import { normalizeImageLabelsState } from "../teacher-tools/apps/image-labels/model.js";
import { normalizeMultiImagesState } from "../teacher-tools/apps/multi-images/model.js";
import { normalizeSurfaceState } from "../teacher-tools/surface/state.js";

// Le registre ne branche encore aucune UI de sauvegarde : il fixe seulement
// les identifiants et l'arborescence stable des premiers formats natifs.
export const BUILTIN_TUJER_CREATION_TYPES = Object.freeze([
  registerTujerCreationType({
    type:"tableau.workspace",
    label:"Tableau complet",
    icon:"dashboard_customize",
    folderPath:["Tableau", "Tableaux"],
    schemaVersion:1
  }),
  registerTujerCreationType({
    type:"tableau.page.labels-text",
    label:"Étiquettes texte",
    icon:"label",
    folderPath:["Tableau", "Étiquettes texte"],
    schemaVersion:1,
    serialize(context = {}){
      const page = context?.page && typeof context.page === "object" ? context.page : context;
      const resolvedBackground = context?.resolvedBackground && typeof context.resolvedBackground === "object"
        ? context.resolvedBackground
        : page?.surface?.background;
      const surface = normalizeSurfaceState({
        ...(page?.surface || {}),
        // Une page enregistrée doit retrouver exactement le fond visible au
        // moment de la sauvegarde, même si ce fond provenait du fond partagé.
        backgroundScope:"page",
        background:resolvedBackground || page?.surface?.background
      });
      return {
        page:{
          toolId:"labels",
          label:String(page?.label || "Étiquettes Texte"),
          icon:String(page?.icon || "label"),
          state:normalizeLabelsState(page?.state),
          surface
        }
      };
    },
    restore(payload = {}){
      const page = payload?.page && typeof payload.page === "object" ? payload.page : {};
      return {
        ...payload,
        page:{
          toolId:"labels",
          label:String(page.label || "Étiquettes Texte"),
          icon:String(page.icon || "label"),
          state:normalizeLabelsState(page.state),
          surface:normalizeSurfaceState({ ...(page.surface || {}), backgroundScope:"page" })
        }
      };
    }
  }),
  registerTujerCreationType({
    type:"tableau.page.image-labels",
    label:"Étiquettes images",
    icon:"collections",
    folderPath:["Tableau", "Étiquettes images"],
    schemaVersion:1,
    serialize(context = {}){
      const page = context?.page && typeof context.page === "object" ? context.page : context;
      const resolvedBackground = context?.resolvedBackground && typeof context.resolvedBackground === "object"
        ? context.resolvedBackground
        : page?.surface?.background;
      return {
        page:{
          toolId:"image-labels",
          label:String(page?.label || "Étiquettes Images"),
          icon:String(page?.icon || "collections"),
          state:normalizeImageLabelsState(page?.state),
          surface:normalizeSurfaceState({
            ...(page?.surface || {}),
            backgroundScope:"page",
            background:resolvedBackground || page?.surface?.background
          })
        }
      };
    },
    restore(payload = {}){
      const page = payload?.page && typeof payload.page === "object" ? payload.page : {};
      return {
        ...payload,
        page:{
          toolId:"image-labels",
          label:String(page.label || "Étiquettes Images"),
          icon:String(page.icon || "collections"),
          state:normalizeImageLabelsState(page.state),
          surface:normalizeSurfaceState({ ...(page.surface || {}), backgroundScope:"page" })
        }
      };
    }
  }),
  registerTujerCreationType({
    type:"tableau.page.multi-images",
    label:"Multimages",
    icon:"collections",
    folderPath:["Tableau", "Multimages"],
    schemaVersion:1,
    serialize(context = {}){
      const page = context?.page && typeof context.page === "object" ? context.page : context;
      return {
        page:{
          toolId:"multi-images",
          label:String(page?.label || "Multimages"),
          icon:String(page?.icon || "collections"),
          state:normalizeMultiImagesState(page?.state),
          surface:normalizeSurfaceState(page?.surface || {})
        }
      };
    },
    restore(payload = {}){
      const page = payload?.page && typeof payload.page === "object" ? payload.page : {};
      return {
        ...payload,
        page:{
          toolId:"multi-images",
          label:String(page.label || "Multimages"),
          icon:String(page.icon || "collections"),
          state:normalizeMultiImagesState(page.state),
          surface:normalizeSurfaceState(page.surface || {})
        }
      };
    }
  }),
  registerTujerCreationType({
    type:"generator.word-search",
    label:"Mots mêlés",
    icon:"grid_on",
    folderPath:["Générateurs", "Mots mêlés"],
    schemaVersion:1
  })
]);
