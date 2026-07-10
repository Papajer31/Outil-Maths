import {
  CONJUGATION_PERSONS,
  CONJUGATION_PRESETS,
  CONJUGATION_TENSES,
  CONJUGATION_VERBS
} from "./data/forms-core.js";

const DEFAULT_SOURCE_MODE = "preset";
const SOURCE_MODES = new Set(["preset", "personal", "custom"]);
const DEFAULT_PRESET_ID = "programme_irreguliers";
const DEFAULT_DRAW_MODE = "random";
const DRAW_MODES = new Set(["in_order", "random"]);
const DEFAULT_QUESTION_FORMAT = "pronoun";
const QUESTION_FORMATS = new Set(["pronoun", "grammar"]);
const DEFAULT_ANSWER_FORMAT = "flexible";
const ANSWER_FORMATS = new Set(["flexible", "form_only", "with_pronoun"]);
const DEFAULT_COMPOUND_AUXILIARY = "avoir";
const COMPOUND_AUXILIARIES = new Set(["avoir", "etre", "both"]);
const COMPOUND_TENSE_IDS = new Set(["passe_compose", "plus_que_parfait"]);
const DEFAULT_TENSES = Object.freeze(["present", "imparfait", "futur", "passe_compose"]);
const DEFAULT_PERSONS = Object.freeze(["je", "tu", "il", "elle", "nous", "vous", "ils", "elles"]);
const TERMINAL_PUNCTUATION_RE = /[.!?…]+$/u;
const APOSTROPHE_RE = /[’‘ʼ`´]/gu;
const WHITESPACE_RE = /\s+/gu;

const OPTIONAL_CIRCUMFLEX_VERB_IDS = new Set([
  "abimer",
  "apparaitre",
  "brûler",
  "bruler",
  "connaitre",
  "couter",
  "diner",
  "disparaitre",
  "entrainer",
  "gouter",
  "paraitre",
  "plaire",
  "rafraichir",
  "reconnaitre",
  "réapparaitre",
  "trainer"
]);

const VERBS_BY_ID = new Map(CONJUGATION_VERBS.map((verb) => [verb.id, verb]));
const VERBS_BY_KEY = new Map(CONJUGATION_VERBS.map((verb) => [normalizeVerbKey(verb.infinitive), verb]));
const TENSE_IDS = Object.freeze(Object.keys(CONJUGATION_TENSES));
const PERSON_IDS = Object.freeze(Object.keys(CONJUGATION_PERSONS));
const PRESET_IDS = Object.freeze(Object.keys(CONJUGATION_PRESETS));
let questionBaseSizeCache = null;
const DOUBLE_AUXILIARY_VERB_IDS = new Set([
  "accourir",
  "apparaitre",
  "demeurer",
  "descendre",
  "entrer",
  "monter",
  "passer",
  "réapparaitre",
  "redescendre",
  "rentrer",
  "ressortir",
  "retourner",
  "sortir",
  "tomber"
]);
const ETRE_COMPOUND_AUXILIARIES = Object.freeze({
  passe_compose: Object.freeze({
    je: "suis",
    tu: "es",
    il: "est",
    elle: "est",
    nous: "sommes",
    vous: "êtes",
    ils: "sont",
    elles: "sont"
  }),
  plus_que_parfait: Object.freeze({
    je: "étais",
    tu: "étais",
    il: "était",
    elle: "était",
    nous: "étions",
    vous: "étiez",
    ils: "étaient",
    elles: "étaient"
  })
});


const PROGRAM_IRREGULAR_VERB_IDS = freezeUniqueIds([
  "faire", "aller", "dire", "venir", "pouvoir", "voir", "vouloir", "prendre"
]);
const ER_CER_VERB_IDS = freezeUniqueIds([
  "annoncer", "avancer", "balancer", "bercer", "coincer", "commencer", "déplacer", "effacer",
  "enfoncer", "exercer", "foncer", "forcer", "glacer", "grincer", "lancer", "menacer",
  "percer", "pincer", "placer", "prononcer", "recommencer", "remplacer", "renoncer", "replacer",
  "sucer", "tracer"
]);
const ER_GER_VERB_IDS = freezeUniqueIds([
  "allonger", "arranger", "bouger", "changer", "charger", "corriger", "dégager", "déménager",
  "déranger", "diriger", "échanger", "encourager", "engager", "exiger", "interroger", "juger",
  "loger", "longer", "manger", "mélanger", "nager", "obliger", "partager", "plonger",
  "ranger", "rédiger", "ronger", "songer", "soulager", "venger", "voltiger", "voyager"
]);
const ER_E_ER_VERB_IDS = freezeUniqueIds([
  "acheter", "achever", "amener", "atteler", "crever", "élever", "emmener", "enlever", "geler",
  "lever", "mener", "peser", "promener", "ramener", "relever", "renouveler", "semer", "soulever",
  "accélérer", "céder", "compléter", "considérer", "espérer", "exagérer", "libérer", "posséder",
  "précéder", "préférer", "procéder", "récupérer", "repérer", "répéter", "suggérer", "lécher",
  "sécher", "régler", "régner", "pénétrer"
]);
const ER_FUTURE_TRADITIONAL_ACCENT_VERB_IDS = freezeUniqueIds([
  "accélérer", "céder", "compléter", "considérer", "espérer", "exagérer", "libérer", "posséder",
  "précéder", "préférer", "procéder", "récupérer", "repérer", "répéter", "suggérer", "lécher",
  "sécher", "régler", "régner", "pénétrer", "protéger"
]);
const ER_APPELER_JETER_VERB_IDS = freezeUniqueIds(["appeler", "rappeler", "jeter", "projeter"]);
const ER_PROTEGER_VERB_IDS = freezeUniqueIds(["protéger"]);
const ER_AYER_VERB_IDS = freezeUniqueIds(["balayer", "effrayer", "essayer", "payer"]);
const ER_OYER_UYER_VERB_IDS = freezeUniqueIds(["aboyer", "déployer", "employer", "nettoyer", "appuyer", "ennuyer", "essuyer"]);
const ER_ENVOYER_RENVOYER_VERB_IDS = freezeUniqueIds(["envoyer", "renvoyer"]);
const ER_IER_VERB_IDS = freezeUniqueIds([
  "apprécier", "associer", "colorier", "confier", "convier", "copier", "crier", "déplier", "envier",
  "étudier", "justifier", "lier", "modifier", "oublier", "parier", "photographier", "plier", "prier",
  "publier", "recopier", "relier", "remercier", "replier", "scier", "supplier", "trier", "vérifier"
]);

const CUSTOM_VERB_BLOCKS = Object.freeze([
  freezeVerbBlock("etre_avoir", "être/avoir", ["être", "avoir"]),
  freezeVerbBlock("programme_irreguliers", "faire/aller...", PROGRAM_IRREGULAR_VERB_IDS),
  freezeVerbBlock("auxiliaire_etre", "auxiliaire être", CONJUGATION_PRESETS.auxiliaire_etre || []),
  freezeVerbBlock("er_cer", "-cer", ER_CER_VERB_IDS),
  freezeVerbBlock("er_ger", "-ger", ER_GER_VERB_IDS),
  freezeVerbBlock("er_e_er", "-e?er/-é?er", ER_E_ER_VERB_IDS),
  freezeVerbBlock("er_ayer", "-ayer", ER_AYER_VERB_IDS),
  freezeVerbBlock("er_oyer_uyer", "-oyer/-uyer", ER_OYER_UYER_VERB_IDS),
  freezeVerbBlock("er_ier", "-ier", ER_IER_VERB_IDS),
  freezeVerbBlock("er_appeler_jeter", "appeler/jeter", ER_APPELER_JETER_VERB_IDS),
  freezeVerbBlock("er_proteger", "protéger", ER_PROTEGER_VERB_IDS),
  freezeVerbBlock("er_envoyer_renvoyer", "envoyer/renvoyer", ER_ENVOYER_RENVOYER_VERB_IDS)
]);

export function getDefaultSettings() {
  return {
    sourceMode: DEFAULT_SOURCE_MODE,
    presetId: DEFAULT_PRESET_ID,
    personalListId: "",
    personalListName: "",
    personalListVerbsText: "",
    customVerbsText: "",
    tenses: [...DEFAULT_TENSES],
    persons: [...DEFAULT_PERSONS],
    questionFormat: DEFAULT_QUESTION_FORMAT,
    answerFormat: DEFAULT_ANSWER_FORMAT,
    compoundAuxiliary: DEFAULT_COMPOUND_AUXILIARY,
    drawMode: DEFAULT_DRAW_MODE
  };
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : {};
  const defaults = getDefaultSettings();

  const sourceMode = SOURCE_MODES.has(String(safeSettings.sourceMode || safeSettings.source_mode || "").trim())
    ? String(safeSettings.sourceMode || safeSettings.source_mode).trim()
    : defaults.sourceMode;
  const presetId = PRESET_IDS.includes(String(safeSettings.presetId || safeSettings.preset_id || "").trim())
    ? String(safeSettings.presetId || safeSettings.preset_id).trim()
    : defaults.presetId;
  const drawMode = DRAW_MODES.has(String(safeSettings.drawMode || safeSettings.draw_mode || "").trim())
    ? String(safeSettings.drawMode || safeSettings.draw_mode).trim()
    : defaults.drawMode;
  const questionFormat = QUESTION_FORMATS.has(String(safeSettings.questionFormat || safeSettings.question_format || "").trim())
    ? String(safeSettings.questionFormat || safeSettings.question_format).trim()
    : defaults.questionFormat;
  const answerFormat = ANSWER_FORMATS.has(String(safeSettings.answerFormat || safeSettings.answer_format || "").trim())
    ? String(safeSettings.answerFormat || safeSettings.answer_format).trim()
    : defaults.answerFormat;
  const compoundAuxiliary = normalizeCompoundAuxiliary(
    safeSettings.compoundAuxiliary ?? safeSettings.compound_auxiliary,
    defaults.compoundAuxiliary
  );

  return {
    ...defaults,
    ...safeSettings,
    sourceMode,
    presetId,
    personalListId: String(safeSettings.personalListId ?? safeSettings.personal_list_id ?? "").trim(),
    personalListName: String(safeSettings.personalListName ?? safeSettings.personal_list_name ?? "").trim(),
    personalListVerbsText: String(safeSettings.personalListVerbsText ?? safeSettings.personal_list_verbs_text ?? ""),
    customVerbsText: String(safeSettings.customVerbsText ?? safeSettings.custom_verbs_text ?? ""),
    tenses: normalizeIdList(safeSettings.tenses ?? safeSettings.selectedTenses ?? safeSettings.selected_tenses, TENSE_IDS, defaults.tenses),
    persons: normalizeIdList(safeSettings.persons ?? safeSettings.selectedPersons ?? safeSettings.selected_persons, PERSON_IDS, defaults.persons),
    questionFormat,
    answerFormat,
    compoundAuxiliary,
    drawMode
  };
}

export function getPresetOptions() {
  return [
    { value: "etre_avoir", label: "Être et avoir" },
    { value: "programme_irreguliers", label: "Être, avoir et irréguliers du programme" },
    { value: "premier_groupe_reguliers", label: "Verbes du 1er groupe réguliers" },
    { value: "premier_groupe", label: "Verbes du 1er groupe" },
    { value: "deuxieme_groupe", label: "Verbes du 2e groupe" },
    { value: "troisieme_groupe", label: "Verbes du 3e groupe" },
    { value: "auxiliaire_etre", label: "Verbes avec auxiliaire être" },
    { value: "tous", label: "Tous les verbes de la base" }
  ];
}

export function getCustomVerbBlockOptions() {
  return CUSTOM_VERB_BLOCKS.map((block) => ({
    id: block.id,
    label: block.label,
    verbIds: [...block.verbIds],
    verbs: block.verbIds
      .map((verbId) => VERBS_BY_ID.get(verbId))
      .filter(Boolean)
      .map((verb) => getVerbDisplayInfinitive(verb))
  }));
}

export function getTenseOptions() {
  return TENSE_IDS.map((value) => ({
    value,
    label: CONJUGATION_TENSES[value]?.shortLabel || value
  }));
}

export function getPersonOptions() {
  return PERSON_IDS.map((value) => ({
    value,
    label: CONJUGATION_PERSONS[value]?.pronoun || value
  }));
}

export function getCompoundAuxiliaryOptions() {
  return [
    { value: "avoir", label: "avoir" },
    { value: "etre", label: "être" },
    { value: "both", label: "les deux" }
  ];
}

export function hasSelectedCompoundTense(tenses = []) {
  return (Array.isArray(tenses) ? tenses : []).some((tenseId) => isCompoundTenseId(tenseId));
}

export function getVerbBaseSize() {
  return CONJUGATION_VERBS.length;
}

export function getQuestionBaseSize() {
  if (questionBaseSizeCache != null) return questionBaseSizeCache;

  questionBaseSizeCache = createQuestions({
    ...getDefaultSettings(),
    sourceMode: "preset",
    presetId: PRESET_IDS.includes("tous") ? "tous" : DEFAULT_PRESET_ID,
    tenses: [...TENSE_IDS],
    persons: [...PERSON_IDS],
    compoundAuxiliary: "both"
  }).length;

  return questionBaseSizeCache;
}

export function resolveSelectedVerbs(settings = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.sourceMode === "custom") {
    return resolveCustomVerbs(cfg.customVerbsText);
  }

  if (cfg.sourceMode === "personal") {
    return resolveCustomVerbs(cfg.personalListVerbsText);
  }

  const presetVerbIds = Array.isArray(CONJUGATION_PRESETS[cfg.presetId])
    ? CONJUGATION_PRESETS[cfg.presetId]
    : CONJUGATION_PRESETS[DEFAULT_PRESET_ID];
  const verbs = presetVerbIds
    .map((id) => VERBS_BY_ID.get(String(id || "")))
    .filter(Boolean);

  return {
    verbs,
    unknown: [],
    requested: presetVerbIds.length,
    recognized: verbs.length
  };
}

export function resolveCustomVerbs(rawText = "") {
  const entries = parseCustomVerbEntries(rawText);
  const verbs = [];
  const unknown = [];
  const seenVerbIds = new Set();
  const seenUnknown = new Set();

  entries.forEach((entry) => {
    const key = normalizeVerbKey(entry);
    if (!key) return;
    const verb = VERBS_BY_KEY.get(key);
    if (!verb) {
      if (!seenUnknown.has(key)) {
        seenUnknown.add(key);
        unknown.push(entry.trim());
      }
      return;
    }
    if (seenVerbIds.has(verb.id)) return;
    seenVerbIds.add(verb.id);
    verbs.push(verb);
  });

  return {
    verbs,
    unknown,
    requested: entries.length,
    recognized: verbs.length
  };
}

export function parseCustomVerbEntries(rawText = "") {
  return String(rawText ?? "")
    .split(/[\n,;]+/gu)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createQuestionDeck(settings = {}) {
  const cfg = normalizeSettings(settings);
  const questions = createQuestions(cfg);

  if (cfg.drawMode === "random") {
    return shuffleArray(questions);
  }

  return questions;
}

export function createQuestions(settings = {}) {
  const cfg = normalizeSettings(settings);
  const { verbs } = resolveSelectedVerbs(cfg);
  const questions = [];

  verbs.forEach((verb) => {
    cfg.tenses.forEach((tenseId) => {
      cfg.persons.forEach((personId) => {
        const nextQuestions = buildQuestionsForCombination({
          verb,
          tenseId,
          personId,
          settings: cfg,
          index: questions.length
        });
        nextQuestions.forEach((question) => {
          if (question) questions.push(question);
        });
      });
    });
  });

  return questions;
}

export function getQuestionStats(settings = {}) {
  const cfg = normalizeSettings(settings);
  const selection = resolveSelectedVerbs(cfg);
  const questions = createQuestions(cfg);

  return {
    verbCount: selection.verbs.length,
    requestedVerbCount: selection.requested,
    unknownVerbs: selection.unknown,
    questionCount: questions.length,
    baseVerbCount: getVerbBaseSize(),
    baseQuestionCount: getQuestionBaseSize()
  };
}

export function buildQuestionsForCombination({ verb, tenseId, personId, settings, index = 0 } = {}) {
  const safeVerb = verb && typeof verb === "object" ? verb : null;
  const cfg = normalizeSettings(settings);
  if (!safeVerb || !shouldIncludeVerbTenseForSettings(safeVerb, tenseId, cfg)) return [];

  if (isClearEtreCompoundQuestion(safeVerb, tenseId)) {
    const agreementOptions = getAgreementOptionsForPerson(personId);
    if (agreementOptions.length) {
      return agreementOptions
        .map((agreement, offset) => buildQuestion({
          verb: safeVerb,
          tenseId,
          personId,
          settings: cfg,
          index: index + offset,
          agreement
        }))
        .filter(Boolean);
    }
  }

  const question = buildQuestion({ verb: safeVerb, tenseId, personId, settings: cfg, index });
  return question ? [question] : [];
}

export function buildQuestion({ verb, tenseId, personId, settings, index = 0, agreement = null } = {}) {
  const safeVerb = verb && typeof verb === "object" ? verb : null;
  const cfg = normalizeSettings(settings);
  const tense = CONJUGATION_TENSES[tenseId];
  const person = CONJUGATION_PERSONS[personId];
  const compoundDetails = getEtreCompoundQuestionDetails({
    verb: safeVerb,
    tenseId,
    personId,
    agreement
  });
  const rawForm = compoundDetails?.form || safeVerb?.forms?.[tenseId]?.[personId];
  const formDetails = getVerbFormDetails({
    verb: safeVerb,
    tenseId,
    personId,
    rawForm
  });
  if (!safeVerb || !tense || !person || !formDetails.displayForm) return null;

  const displayInfinitive = getVerbDisplayInfinitive(safeVerb);
  const formOnlyAnswer = formDetails.displayForm;
  const pronounAnswer = buildDisplayAnswerWithPronoun(person.pronoun, formDetails.displayForms);
  const expectedAnswer = cfg.answerFormat === "form_only" ? formOnlyAnswer : pronounAnswer;
  const acceptedAnswers = cfg.answerFormat === "form_only"
    ? formDetails.acceptedForms
    : cfg.answerFormat === "flexible"
      ? [
          ...formDetails.acceptedForms,
          ...formDetails.acceptedForms.map((form) => buildAnswerWithPronoun(person.pronoun, form))
        ]
      : formDetails.acceptedForms.map((form) => buildAnswerWithPronoun(person.pronoun, form));
  const prompt = buildPrompt({
    infinitive: displayInfinitive,
    tense,
    person,
    personId,
    questionFormat: cfg.questionFormat,
    agreement: compoundDetails?.agreement || null,
    isEtreCompound: Boolean(compoundDetails)
  });
  const agreementId = compoundDetails?.agreement?.id ? `-${compoundDetails.agreement.id}` : "";

  return {
    id: `${safeVerb.id}-${tenseId}-${personId}${agreementId}-${index + 1}`,
    verbId: safeVerb.id,
    infinitive: displayInfinitive,
    tenseId,
    personId,
    agreement: compoundDetails?.agreement || null,
    auxiliary: getVerbAuxiliaryCategory(safeVerb),
    prompt,
    expectedAnswer,
    acceptedAnswers: buildAcceptedAnswerVariants(expectedAnswer, ...acceptedAnswers),
    explanation: "",
    key: `${safeVerb.id}::${tenseId}::${personId}::${agreementId}::${expectedAnswer}`
  };
}

export function buildPrompt({ infinitive, tense, person, personId, questionFormat, agreement = null, isEtreCompound = false }) {
  const safeInfinitive = String(infinitive || "").trim();
  const tenseLabel = String(tense?.shortLabel || tense?.label || "").trim();
  const grammarTenseLabel = normalizeGrammarTenseLabel(tense, tenseLabel);
  const pronoun = String(person?.pronoun || "").trim();
  const grammarLabel = normalizeGrammarPersonLabel(person, pronoun);
  const safeAgreement = agreement && typeof agreement === "object" ? agreement : null;

  if (questionFormat === "grammar") {
    if (isEtreCompound && safeAgreement && personId === "vous") {
      return `Conjugue le verbe *${safeInfinitive}* ${buildGrammarTensePhrase(grammarTenseLabel)},§avec le pronom "*vous*".§(accord au ${safeAgreement.grammarLabel})`;
    }

    const basePrompt = `Conjugue le verbe *${safeInfinitive}* ${buildGrammarTensePhrase(grammarTenseLabel)},§à la *${grammarLabel}*.`;
    if (isEtreCompound && safeAgreement) {
      return `${basePrompt}§(accord au ${safeAgreement.grammarLabel})`;
    }
    return basePrompt;
  }

  const basePrompt = `verbe : *${safeInfinitive}*§temps : *${tenseLabel}*§pronom : *${pronoun}*`;
  if (isEtreCompound && safeAgreement) {
    return `${basePrompt}§accord : *${safeAgreement.promptLabel}*`;
  }
  return basePrompt;
}

function normalizeGrammarTenseLabel(tense, fallback = "") {
  return String(tense?.label || tense?.shortLabel || fallback || "")
    .trim()
    .replace(/\s+de\s+l[’']indicatif\b/giu, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

function buildGrammarTensePhrase(tenseLabel = "") {
  const safeLabel = String(tenseLabel || "").trim();
  if (!safeLabel) return "au temps demandé";
  const preposition = startsWithElidableSound(safeLabel) ? "à l’" : "au ";
  return `${preposition}*${safeLabel}*`;
}

function normalizeGrammarPersonLabel(person, pronoun = "") {
  const rawLabel = String(person?.grammarLabel || pronoun || "").trim();
  const safePronoun = String(person?.pronoun || pronoun || "").trim().toLocaleLowerCase("fr-FR");
  const baseLabel = rawLabel
    .replace(/\s+[—-]\s*(?:il|ils|elle|elles)\s*$/iu, "")
    .replace(WHITESPACE_RE, " ")
    .trim();
  const genderLabel = getGrammarGenderLabel(safePronoun);

  if (genderLabel && baseLabel && baseLabel !== safePronoun && !/\b(?:masculin|féminin|feminin)\b/iu.test(baseLabel)) {
    return `${baseLabel} ${genderLabel}`;
  }

  return baseLabel || rawLabel;
}

function getGrammarGenderLabel(pronoun = "") {
  if (pronoun === "il" || pronoun === "ils") return "au masculin";
  if (pronoun === "elle" || pronoun === "elles") return "au féminin";
  return "";
}


function shouldIncludeVerbTenseForSettings(verb, tenseId, settings = {}) {
  if (!isCompoundTenseId(tenseId)) return true;

  const auxiliary = getVerbAuxiliaryCategory(verb);
  if (auxiliary === "double") return false;

  const selectedAuxiliary = normalizeCompoundAuxiliary(settings.compoundAuxiliary, DEFAULT_COMPOUND_AUXILIARY);
  if (auxiliary === "être") return selectedAuxiliary === "etre" || selectedAuxiliary === "both";
  if (auxiliary === "avoir") return selectedAuxiliary === "avoir" || selectedAuxiliary === "both";
  return false;
}

function isCompoundTenseId(tenseId = "") {
  return COMPOUND_TENSE_IDS.has(String(tenseId || "").trim());
}

function isClearEtreCompoundQuestion(verb, tenseId) {
  return isCompoundTenseId(tenseId) && getVerbAuxiliaryCategory(verb) === "être";
}

function getVerbAuxiliaryCategory(verb = {}) {
  const id = String(verb?.id || "").trim();
  if (DOUBLE_AUXILIARY_VERB_IDS.has(id)) return "double";

  const rawAuxiliary = String(verb?.auxiliary || "avoir")
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("fr-FR");
  if (rawAuxiliary === "double") return "double";
  if (rawAuxiliary === "être" || rawAuxiliary === "etre") return "être";
  return "avoir";
}

function normalizeCompoundAuxiliary(value = "", fallback = DEFAULT_COMPOUND_AUXILIARY) {
  const normalized = String(value || "")
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/[êèéë]/gu, "e");
  if (normalized === "les deux" || normalized === "les_deux" || normalized === "both") return "both";
  if (COMPOUND_AUXILIARIES.has(normalized)) return normalized;
  return fallback;
}

function getAgreementOptionsForPerson(personId = "") {
  switch (String(personId || "")) {
    case "je":
    case "tu":
      return [
        createAgreementOption("masculin", "masculin", "ms"),
        createAgreementOption("féminin", "féminin", "fs")
      ];
    case "nous":
      return [
        createAgreementOption("masculin", "masculin", "mp"),
        createAgreementOption("féminin", "féminin", "fp")
      ];
    case "vous":
      return [
        createAgreementOption("masculin singulier", "masculin singulier", "ms"),
        createAgreementOption("féminin singulier", "féminin singulier", "fs"),
        createAgreementOption("masculin pluriel", "masculin pluriel", "mp"),
        createAgreementOption("féminin pluriel", "féminin pluriel", "fp")
      ];
    default:
      return [];
  }
}

function createAgreementOption(promptLabel, grammarLabel, formKey) {
  return Object.freeze({
    id: `${formKey}-${promptLabel.replace(/\s+/gu, "-")}`,
    promptLabel,
    grammarLabel,
    formKey
  });
}

function getEtreCompoundQuestionDetails({ verb, tenseId, personId, agreement }) {
  if (!verb || !isClearEtreCompoundQuestion(verb, tenseId) || !agreement) return null;
  const auxiliary = ETRE_COMPOUND_AUXILIARIES[tenseId]?.[personId];
  if (!auxiliary) return null;
  const participles = getEtreCompoundParticiples(verb, tenseId);
  const participle = participles[agreement.formKey];
  if (!participle) return null;
  return {
    form: `${auxiliary} ${participle}`,
    agreement
  };
}

function getEtreCompoundParticiples(verb, tenseId) {
  const forms = verb?.forms?.[tenseId] || {};
  const auxiliaries = ETRE_COMPOUND_AUXILIARIES[tenseId] || {};
  return {
    ms: extractCompoundParticiple(forms.il, auxiliaries.il),
    fs: extractCompoundParticiple(forms.elle, auxiliaries.elle),
    mp: extractCompoundParticiple(forms.ils, auxiliaries.ils),
    fp: extractCompoundParticiple(forms.elles, auxiliaries.elles)
  };
}

function extractCompoundParticiple(form = "", auxiliary = "") {
  const safeForm = String(form || "").trim();
  const safeAuxiliary = String(auxiliary || "").trim();
  if (!safeForm || !safeAuxiliary) return "";
  if (safeForm.toLocaleLowerCase("fr-FR").startsWith(`${safeAuxiliary.toLocaleLowerCase("fr-FR")} `)) {
    return safeForm.slice(safeAuxiliary.length).trim();
  }
  return safeForm.replace(/^\S+\s+/u, "").trim();
}

export function buildAnswerWithPronoun(pronoun, form) {
  const safePronoun = String(pronoun || "").trim();
  const safeForm = String(form || "").trim();
  if (!safePronoun) return safeForm;
  if (!safeForm) return safePronoun;

  if (safePronoun === "je" && startsWithElidableSound(safeForm)) {
    return `j’${safeForm}`;
  }

  return `${safePronoun} ${safeForm}`;
}

export function evaluateAnswer(question, rawAnswer = "") {
  const submittedAnswer = normalizeSubmittedAnswer(rawAnswer);
  const expectedAnswers = getAcceptedAnswerList(question).map(normalizeSubmittedAnswer).filter(Boolean);

  return {
    submittedAnswer,
    expectedAnswers,
    expectedAnswer: String(question?.expectedAnswer || "").trim(),
    isCorrect: Boolean(submittedAnswer) && expectedAnswers.includes(submittedAnswer)
  };
}

export function normalizeSubmittedAnswer(value = "") {
  return String(value ?? "")
    .normalize("NFC")
    .replace(APOSTROPHE_RE, "'")
    .replace(/\s*'\s*/gu, "'")
    .replace(WHITESPACE_RE, " ")
    .trim()
    .replace(TERMINAL_PUNCTUATION_RE, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function getAcceptedAnswerList(question) {
  const answers = [String(question?.expectedAnswer || "")];
  if (Array.isArray(question?.acceptedAnswers)) {
    question.acceptedAnswers.forEach((answer) => answers.push(String(answer || "")));
  }
  return answers
    .map((answer) => answer.trim())
    .filter(Boolean)
    .filter((answer, index, list) => list.indexOf(answer) === index);
}

export function shuffleArray(values = []) {
  const nextValues = Array.isArray(values) ? [...values] : [];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }
  return nextValues;
}

function normalizeIdList(value, allowedValues, fallback = []) {
  const allowed = new Set(allowedValues);
  if (value == null) return [...fallback];

  const rawValues = Array.isArray(value)
    ? value
    : String(value).split(/[;,\s]+/gu);
  return rawValues
    .map((item) => String(item || "").trim())
    .filter((item) => allowed.has(item))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeVerbKey(value = "") {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[îï]/giu, "i")
    .replace(/[ûü]/giu, "u")
    .replace(WHITESPACE_RE, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function getVerbDisplayInfinitive(verbOrInfinitive = "") {
  if (verbOrInfinitive && typeof verbOrInfinitive === "object") {
    return getRectifiedOptionalCircumflexText(
      String(verbOrInfinitive.infinitive || "").trim(),
      getVerbOptionalCircumflexKey(verbOrInfinitive)
    );
  }

  const rawInfinitive = String(verbOrInfinitive || "").trim();
  return getRectifiedOptionalCircumflexText(rawInfinitive, normalizeVerbKey(rawInfinitive));
}

function getVerbDisplayForm(verb, form = "") {
  return getRectifiedOptionalCircumflexText(
    String(form || "").trim(),
    getVerbOptionalCircumflexKey(verb)
  );
}


function getVerbFormDetails({ verb, tenseId, personId, rawForm } = {}) {
  const safeVerb = verb && typeof verb === "object" ? verb : null;
  const rawVariants = splitFormVariants(rawForm);
  const displayForms = rawVariants
    .map((form) => getVerbDisplayForm(safeVerb, form))
    .filter(Boolean);
  const acceptedForms = [...displayForms, ...rawVariants];

  const traditionalFuture = getTraditionalFutureVariant({
    verb: safeVerb,
    tenseId,
    personId
  });
  if (traditionalFuture) acceptedForms.push(traditionalFuture);

  const uniqueDisplayForms = uniqueTrimmed(displayForms);
  const uniqueAcceptedForms = uniqueTrimmed(acceptedForms);

  return {
    displayForms: uniqueDisplayForms,
    displayForm: uniqueDisplayForms.join(" / "),
    acceptedForms: uniqueAcceptedForms
  };
}

function splitFormVariants(rawForm = "") {
  return String(rawForm ?? "")
    .split(/\s+\/\s+/gu)
    .map((form) => form.trim())
    .filter(Boolean);
}

function buildDisplayAnswerWithPronoun(pronoun, forms = []) {
  const safeForms = Array.isArray(forms) ? forms : [forms];
  return uniqueTrimmed(safeForms)
    .map((form) => buildAnswerWithPronoun(pronoun, form))
    .join(" / ");
}

function getTraditionalFutureVariant({ verb, tenseId, personId } = {}) {
  const safeVerb = verb && typeof verb === "object" ? verb : null;
  const id = String(safeVerb?.id || "").trim();
  if (!safeVerb || tenseId !== "futur" || !ER_FUTURE_TRADITIONAL_ACCENT_VERB_IDS.includes(id)) return "";

  const infinitive = String(safeVerb.infinitive || "").trim();
  if (!infinitive.endsWith("er")) return "";

  const stem = infinitive.slice(0, -2);
  const endings = {
    je: "erai",
    tu: "eras",
    il: "era",
    elle: "era",
    nous: "erons",
    vous: "erez",
    ils: "eront",
    elles: "eront"
  };
  const ending = endings[personId];
  return ending ? `${stem}${ending}` : "";
}

function uniqueTrimmed(values = []) {
  const result = [];
  const seen = new Set();
  (Array.isArray(values) ? values : [values]).forEach((value) => {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function getVerbOptionalCircumflexKey(verb) {
  const rawId = String(verb?.id || "").trim();
  const rawInfinitive = String(verb?.infinitive || "").trim();
  const normalizedId = normalizeVerbKey(rawId);
  const normalizedInfinitive = normalizeVerbKey(rawInfinitive);

  if (OPTIONAL_CIRCUMFLEX_VERB_IDS.has(rawId)) return rawId;
  if (OPTIONAL_CIRCUMFLEX_VERB_IDS.has(rawInfinitive)) return rawInfinitive;
  if (OPTIONAL_CIRCUMFLEX_VERB_IDS.has(normalizedId)) return normalizedId;
  if (OPTIONAL_CIRCUMFLEX_VERB_IDS.has(normalizedInfinitive)) return normalizedInfinitive;
  return "";
}

function getRectifiedOptionalCircumflexText(value = "", verbKey = "") {
  const text = String(value || "");
  const key = normalizeVerbKey(verbKey);
  if (!key || !OPTIONAL_CIRCUMFLEX_VERB_IDS.has(key)) return text;

  switch (key) {
    case "abimer":
      return text.replace(/abîm/giu, "abim");
    case "apparaitre":
      return text.replace(/apparaî/giu, "apparai");
    case "bruler":
      return text.replace(/brû/giu, "bru");
    case "connaitre":
      return text.replace(/connaî/giu, "connai");
    case "couter":
      return text.replace(/coû/giu, "cou");
    case "diner":
      return text.replace(/dîn/giu, "din");
    case "disparaitre":
      return text.replace(/disparaî/giu, "disparai");
    case "entrainer":
      return text.replace(/entraî/giu, "entrain");
    case "gouter":
      return text.replace(/goû/giu, "gou");
    case "paraitre":
      return text.replace(/paraî/giu, "parai");
    case "plaire":
      return text.replace(/plaî/giu, "plai");
    case "rafraichir":
      return text.replace(/rafraîch/giu, "rafraich");
    case "réapparaitre":
      return text.replace(/réapparaî/giu, "réapparai");
    case "reconnaitre":
      return text.replace(/reconnaî/giu, "reconnai");
    case "trainer":
      return text.replace(/traîn/giu, "train");
    default:
      return text;
  }
}

function startsWithElidableSound(value = "") {
  const text = String(value || "").trim();
  if (/^(?:hauss|hériss|heur|hiss|hoch|hurl)/iu.test(text)) return false;
  return /^[aeéèêëiîïoôöuùûüyh]/iu.test(text);
}

function freezeUniqueIds(values = []) {
  return Object.freeze(uniqueTrimmed(values));
}

function freezeVerbBlock(id, label, verbIds = []) {
  return Object.freeze({
    id,
    label,
    verbIds: freezeUniqueIds(verbIds)
  });
}

function buildAcceptedAnswerVariants(...answers) {
  const variants = [];
  answers.forEach((answer) => {
    const safeAnswer = String(answer || "").trim();
    if (!safeAnswer) return;
    variants.push(safeAnswer);
    if (safeAnswer.includes("’")) variants.push(safeAnswer.replaceAll("’", "'"));
    if (safeAnswer.includes("'")) variants.push(safeAnswer.replaceAll("'", "’"));
  });

  return variants
    .map((answer) => answer.trim())
    .filter(Boolean)
    .filter((answer, index, list) => list.indexOf(answer) === index);
}

export {
  CONJUGATION_PERSONS,
  CONJUGATION_PRESETS,
  CONJUGATION_TENSES,
  CONJUGATION_VERBS,
  DEFAULT_ANSWER_FORMAT,
  DEFAULT_COMPOUND_AUXILIARY,
  DEFAULT_DRAW_MODE,
  DEFAULT_PERSONS,
  DEFAULT_PRESET_ID,
  DEFAULT_QUESTION_FORMAT,
  DEFAULT_SOURCE_MODE,
  DEFAULT_TENSES
};
