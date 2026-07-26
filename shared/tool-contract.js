const TOOL_ACTIVITY_MODES = Object.freeze(["individual", "group"]);
const TOOL_ACTIVITY_MODE_LABELS = Object.freeze({
  individual: "Individuel",
  group: "Groupe"
});

const TOOL_RUNTIME_CAPABILITY_LEVELS = new Set(["required", "supported", "unsupported"]);
const TOOL_SUPPORTED_ADVANCE_MODES = new Set(["auto", "user", "tool"]);
const TOOL_SUPPORTED_TIMING_MODES = new Set(["engine", "tool"]);
const DEFAULT_TOOL_VERSION = "1";

export function defineTool(toolId, label, tool = {}) {
  return normalizeToolContract({
    ...tool,
    id: toolId,
    label
  }, {
    toolId,
    label
  });
}

export function normalizeToolId(value, fallback = "") {
  const safeValue = String(value ?? "").trim();
  if (safeValue) return safeValue;
  return String(fallback ?? "").trim();
}

export function normalizeToolLabel(value, fallback = "") {
  const safeValue = String(value ?? "").trim();
  if (safeValue) return safeValue;
  return String(fallback ?? "").trim();
}

export function normalizeToolVersion(value, fallback = DEFAULT_TOOL_VERSION) {
  const safeValue = String(value ?? "").trim();
  if (safeValue) return safeValue;
  const safeFallback = String(fallback ?? DEFAULT_TOOL_VERSION).trim();
  return safeFallback || DEFAULT_TOOL_VERSION;
}

export function normalizeToolDescription(value, fallback = "") {
  const safeValue = String(value ?? "").trim();
  if (safeValue) return safeValue;
  return String(fallback ?? "").trim();
}

export function normalizeToolInstruction(value, fallback = "") {
  const safeValue = String(value ?? "").trim();
  if (safeValue) return safeValue;
  return String(fallback ?? "").trim();
}

export function normalizeToolTags(value) {
  const rawValues = Array.isArray(value)
    ? value
    : value == null
      ? []
      : [value];

  const uniqueTags = [];
  rawValues.forEach((item) => {
    const normalized = String(item ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
    if (!normalized) return;
    if (uniqueTags.includes(normalized)) return;
    uniqueTags.push(normalized);
  });

  return uniqueTags;
}

export function resolveToolInstruction(tool, settings = null) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const toolDefaultInstruction = normalizeToolInstruction(safeTool.defaultInstruction, "");
  const sourceInstruction = String(
    settings?.sourceInstruction
      ?? settings?.source_instruction
      ?? ""
  ).trim();
  const defaultInstruction = sourceInstruction || toolDefaultInstruction;
  const supportsCustomInstruction = safeTool.supportsCustomInstruction !== false;

  if (!supportsCustomInstruction) {
    return defaultInstruction;
  }

  const common = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings.common && typeof settings.common === "object" ? settings.common : settings)
    : {};
  const instruction = common && typeof common.instruction === "object" && !Array.isArray(common.instruction)
    ? common.instruction
    : null;

  if (instruction?.hidden === true) {
    return "";
  }

  if (!instruction || instruction.enabled !== true) {
    return defaultInstruction;
  }

  const customText = String(instruction.text ?? "").trim();
  return customText;
}

export function normalizeToolPathSegment(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

export function normalizeRuntimeCapabilities(rawCapabilities = {}, tool = null) {
  // Transitional compatibility for legacy hooks:
  // hasAnswerPhase, usesCustomQuestionFlow, hideCommonToolSettings, getRunProfile.
  const safeRaw = rawCapabilities && typeof rawCapabilities === "object" && !Array.isArray(rawCapabilities)
    ? rawCapabilities
    : {};
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool)
    ? tool
    : {};

  return {
    questionPhase: normalizeCapabilityLevel(
      safeRaw.questionPhase,
      "required"
    ),
    answerPhase: normalizeCapabilityLevel(
      safeRaw.answerPhase,
      safeTool.hasAnswerPhase === false ? "unsupported" : "supported"
    ),
    transitionPhase: normalizeCapabilityLevel(
      safeRaw.transitionPhase,
      safeTool.usesCustomQuestionFlow === true ? "supported" : "required"
    ),
    supportedAdvanceModes: normalizeCapabilityModesList(
      safeRaw.supportedAdvanceModes,
      ["auto", "user", "tool"]
    ),
    supportedTimingModes: normalizeCapabilityModesList(
      safeRaw.supportedTimingModes,
      ["engine", "tool"]
    ),
    supportsCommonFlowSettings: safeRaw.supportsCommonFlowSettings != null
      ? safeRaw.supportsCommonFlowSettings !== false
      : safeTool.hideCommonToolSettings !== true
  };
}

export function getToolRuntimeCapabilities(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const rawCapabilities = typeof safeTool.getRuntimeCapabilities === "function"
    ? safeTool.getRuntimeCapabilities(context)
    : safeTool.runtimeCapabilities ?? null;

  return normalizeRuntimeCapabilities(rawCapabilities, safeTool);
}

export function getToolPassationProfileSupport(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const profile = context?.passationProfile || {
    activityMode: context?.activityMode,
    responseUi: context?.responseUi,
    progressMode: context?.progressMode
  };

  const defaultSupport = {
    compatible: true,
    blockingMessage: "",
    supportsCommonFlowSettings: true,
    showSpecificToolSettings: true,
    profile
  };

  const rawSupport = typeof safeTool.getPassationProfileSupport === "function"
    ? safeTool.getPassationProfileSupport({ ...context, passationProfile: profile })
    : null;

  if (!rawSupport || typeof rawSupport !== "object") {
    return defaultSupport;
  }

  return {
    ...defaultSupport,
    ...rawSupport,
    compatible: rawSupport.compatible !== false,
    blockingMessage: String(rawSupport.blockingMessage || rawSupport.reason || "").trim(),
    profile
  };
}

export function getToolActivityModeProfile(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const rawProfile = typeof safeTool.getActivityModeProfile === "function"
    ? safeTool.getActivityModeProfile(context)
    : safeTool.activityModeProfile ?? null;
  const supportedModes = getToolSupportedActivityModes(safeTool, context);
  const capabilities = getToolRuntimeCapabilities(safeTool, context);
  const activityMode = normalizeActivityMode(context?.activityMode ?? context?.activity_mode ?? "individual");

  return normalizeActivityModeProfile(rawProfile, {
    activityMode,
    tool: safeTool,
    supportedModes,
    capabilities,
    context
  });
}

export function getToolSupportedActivityModes(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const rawSupportedModes = typeof safeTool.getSupportedActivityModes === "function"
    ? safeTool.getSupportedActivityModes(context)
    : safeTool.supportedActivityModes;

  const normalizedModes = normalizeActivityModesList(rawSupportedModes);
  if (normalizedModes.length) {
    return normalizedModes;
  }

  const profile = typeof safeTool.getActivityModeProfile === "function"
    ? safeTool.getActivityModeProfile(context)
    : safeTool.activityModeProfile ?? null;

  const derivedModes = normalizeActivityModesList(profile?.supportedModes ?? profile?.supportedActivityModes);
  if (derivedModes.length) {
    return derivedModes;
  }

  return [...TOOL_ACTIVITY_MODES];
}

export function createToolActivityRuntime(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};

  if (typeof safeTool.createActivity === "function" && safeTool.createActivity !== createToolActivityRuntime) {
    return normalizeRuntimeWrapper(safeTool.createActivity(context), context, safeTool);
  }

  return normalizeRuntimeWrapper(createLegacyToolRuntime(safeTool, context), context, safeTool);
}

export function normalizeToolContract(tool = {}, { toolId = "", label = "" } = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const resolvedId = resolveToolId(safeTool, toolId);
  const resolvedLabel = resolveToolLabel(safeTool, label || resolvedId);
  const resolvedVersion = normalizeToolVersion(safeTool.version);
  const resolvedDescription = normalizeToolDescription(safeTool.description, safeTool.meta?.description ?? "");
  const resolvedDefaultInstruction = normalizeToolInstruction(safeTool.defaultInstruction, safeTool.meta?.defaultInstruction ?? "");
  const resolvedTags = normalizeToolTags(safeTool.tags ?? safeTool.meta?.tags ?? []);
  const resolvedPresetSource = safeTool.presetSource ?? safeTool.presetsSource ?? safeTool.meta?.presetSource ?? null;
  const sharedRuntimeCache = {
    runtime: null
  };

  const baseCapabilities = getToolRuntimeCapabilities(safeTool);
  const baseProfile = getToolActivityModeProfile(safeTool, {});

  function getSharedRuntime(context = {}) {
    if (!sharedRuntimeCache.runtime) {
      sharedRuntimeCache.runtime = createToolActivityRuntime(safeTool, context);
    }
    return sharedRuntimeCache.runtime;
  }

  function clearSharedRuntime() {
    sharedRuntimeCache.runtime = null;
  }

  return {
    ...safeTool,
    id: resolvedId,
    version: resolvedVersion,
    label: resolvedLabel,
    description: resolvedDescription,
    tags: [...resolvedTags],
    defaultInstruction: resolvedDefaultInstruction,
    supportsCustomInstruction: safeTool.supportsCustomInstruction !== false,
    presetSource: resolvedPresetSource ?? undefined,
    meta: safeTool.meta && typeof safeTool.meta === "object" ? { ...safeTool.meta } : undefined,
    supportsCommonFlowSettings: baseCapabilities.supportsCommonFlowSettings,
    hideCommonToolSettings: baseCapabilities.supportsCommonFlowSettings ? false : true,
    hasAnswerPhase: baseCapabilities.answerPhase !== "unsupported",
    usesCustomQuestionFlow: safeTool.usesCustomQuestionFlow === true || baseCapabilities.transitionPhase !== "required",
    supportedActivityModes: [...baseProfile.supportedModes],
    supportedModes: [...baseProfile.supportedModes],
    getDefaultSettings: typeof safeTool.getDefaultSettings === "function"
      ? (...args) => safeTool.getDefaultSettings(...args)
      : () => ({}),
    renderToolSettings: typeof safeTool.renderToolSettings === "function"
      ? (...args) => safeTool.renderToolSettings(...args)
      : () => "",
    readToolSettings: typeof safeTool.readToolSettings === "function"
      ? (...args) => safeTool.readToolSettings(...args)
      : (container, draft) => draft ?? {},
    buildRuntimeConfig(settings = {}) {
      if (typeof safeTool.buildRuntimeConfig === "function") {
        return safeTool.buildRuntimeConfig(settings);
      }
      return settings ?? {};
    },
    resolveInstruction(settings = {}) {
      return resolveToolInstruction({
        ...safeTool,
        defaultInstruction: resolvedDefaultInstruction,
        supportsCustomInstruction: safeTool.supportsCustomInstruction !== false
      }, settings);
    },
    getRuntimeCapabilities(context = {}) {
      return getToolRuntimeCapabilities(safeTool, context);
    },
    getActivityModeProfile(context = {}) {
      return getToolActivityModeProfile(safeTool, context);
    },
    getSupportedActivityModes(context = {}) {
      return getToolSupportedActivityModes(safeTool, context);
    },
    getPassationProfileSupport(context = {}) {
      return getToolPassationProfileSupport(safeTool, context);
    },
    getRunProfile(context = {}) {
      return getToolRunProfile(safeTool, context);
    },
    createActivity(context = {}) {
      return createToolActivityRuntime(safeTool, context);
    },
    mount(container, context = {}) {
      return getSharedRuntime(context).mount(container, context);
    },
    start(container, context = {}) {
      const runtime = getSharedRuntime(context);
      if (typeof runtime.start === "function") {
        return runtime.start(container, context);
      }
      return undefined;
    },
    next(containerOrContext, maybeContext = {}) {
      return getSharedRuntime(maybeContext).next(containerOrContext, maybeContext);
    },
    nextQuestion(containerOrContext, maybeContext = {}) {
      return getSharedRuntime(maybeContext).nextQuestion(containerOrContext, maybeContext);
    },
    showAnswer(containerOrContext, maybeContext = {}) {
      return getSharedRuntime(maybeContext).showAnswer(containerOrContext, maybeContext);
    },
    unmount(container, context = {}) {
      try {
        return getSharedRuntime(context).unmount(container, context);
      } finally {
        clearSharedRuntime();
      }
    }
  };
}

export function getToolRunProfile(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const settings = context?.settings ?? {};
  const selectedStudents = Array.isArray(context?.selectedStudents)
    ? context.selectedStudents
    : Array.isArray(context?.students)
      ? context.students
      : [];
  const selectedStudentIds = selectedStudents
    .map((student) => String(student?.id || "").trim())
    .filter(Boolean);
  const rawProfile = typeof safeTool.getRunProfile === "function"
    ? safeTool.getRunProfile({
        ...context,
        settings
      })
    : null;
  const modeProfile = getToolActivityModeProfile(safeTool, context);
  const currentMode = normalizeModeForRunProfile(context?.activityMode ?? context?.runMode);
  const currentModeProfile = modeProfile[currentMode] ?? { supported: true, reason: "" };

  const runsWithoutIdentifiedStudents = String(context?.runMode || context?.sessionMode || "").trim().toLowerCase() === "projected-teacher";
  const requiresStudent = runsWithoutIdentifiedStudents
    ? false
    : typeof safeTool.requiresStudent === "function"
      ? !!safeTool.requiresStudent(settings)
      : safeTool.requiresStudent === true
        ? true
        : !!rawProfile?.requiresStudent;

  const allowedStudentIds = runsWithoutIdentifiedStudents
    ? []
    : Array.isArray(rawProfile?.allowedStudentIds)
      ? rawProfile.allowedStudentIds.map((id) => String(id || "").trim()).filter(Boolean)
      : requiresStudent
        ? selectedStudentIds
        : [];

  const blockingMessage = String(
    rawProfile?.blockingMessage
    || (currentModeProfile.supported === false ? currentModeProfile.reason : "")
    || ""
  ).trim();

  return {
    requiresStudent,
    allowedStudentIds,
    blockingMessage
  };
}

function resolveToolId(tool, fallbackId = "") {
  const id = normalizeToolId(tool?.id, fallbackId);
  return id || normalizeToolId(fallbackId);
}

function resolveToolLabel(tool, fallbackLabel = "") {
  const label = normalizeToolLabel(tool?.label, fallbackLabel);
  return label || normalizeToolLabel(fallbackLabel, resolveToolId(tool, fallbackLabel));
}

function normalizeRuntimeWrapper(runtime, context = {}, tool = null) {
  const safeRuntime = runtime && typeof runtime === "object" && !Array.isArray(runtime)
    ? runtime
    : null;
  if (!safeRuntime) {
    throw new Error(`Runtime outil invalide pour ${resolveToolId(tool)}.`);
  }

  const mount = typeof safeRuntime.mount === "function" ? safeRuntime.mount.bind(safeRuntime) : null;
  const unmount = typeof safeRuntime.unmount === "function" ? safeRuntime.unmount.bind(safeRuntime) : null;
  if (!mount || !unmount) {
    throw new Error(`Runtime outil invalide pour ${resolveToolId(tool)} : mount / unmount manquants.`);
  }

  const start = typeof safeRuntime.start === "function" ? safeRuntime.start.bind(safeRuntime) : null;
  const next = typeof safeRuntime.next === "function"
    ? safeRuntime.next.bind(safeRuntime)
    : typeof safeRuntime.nextQuestion === "function"
      ? safeRuntime.nextQuestion.bind(safeRuntime)
      : null;
  const nextQuestion = typeof safeRuntime.nextQuestion === "function"
    ? safeRuntime.nextQuestion.bind(safeRuntime)
    : next;
  const showAnswer = typeof safeRuntime.showAnswer === "function" ? safeRuntime.showAnswer.bind(safeRuntime) : null;
  const getShellAnswerDisplayState = typeof safeRuntime.getShellAnswerDisplayState === "function"
    ? safeRuntime.getShellAnswerDisplayState.bind(safeRuntime)
    : null;
  const setShellAnswerDisplayMode = typeof safeRuntime.setShellAnswerDisplayMode === "function"
    ? safeRuntime.setShellAnswerDisplayMode.bind(safeRuntime)
    : null;

  const normalized = {
    ...safeRuntime,
    mount(container, maybeContext = context) {
      return mount(container, maybeContext);
    },
    unmount(container, maybeContext = context) {
      return unmount(container, maybeContext);
    }
  };

  if (start) {
    normalized.start = (container, maybeContext = context) => start(container, maybeContext);
  }

  if (next) {
    normalized.next = (containerOrContext, maybeContext = context) => next(containerOrContext, maybeContext);
  }

  if (nextQuestion) {
    normalized.nextQuestion = (containerOrContext, maybeContext = context) => nextQuestion(containerOrContext, maybeContext);
  }

  if (showAnswer) {
    normalized.showAnswer = (containerOrContext, maybeContext = context) => showAnswer(containerOrContext, maybeContext);
  }

  if (getShellAnswerDisplayState) {
    normalized.getShellAnswerDisplayState = (container, maybeContext = context) => {
      return getShellAnswerDisplayState(container, maybeContext);
    };
  }

  if (setShellAnswerDisplayMode) {
    normalized.setShellAnswerDisplayMode = (container, maybeContext = context, mode = "correction") => {
      return setShellAnswerDisplayMode(container, maybeContext, mode);
    };
  }

  return normalized;
}

function createLegacyToolRuntime(tool, context = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  let currentContainer = null;

  const runtime = {
    mount(container, maybeContext = context) {
      currentContainer = container;
      if (typeof safeTool.mount === "function") {
        return safeTool.mount(container, maybeContext);
      }
      return undefined;
    },
    start(container, maybeContext = context) {
      currentContainer = container ?? currentContainer;
      if (typeof safeTool.start === "function") {
        return safeTool.start(currentContainer, maybeContext);
      }
      return undefined;
    },
    next(containerOrContext, maybeContext = context) {
      const { container, nextContext } = splitRuntimeArgs(containerOrContext, maybeContext, currentContainer, context);
      currentContainer = container ?? currentContainer;

      if (typeof safeTool.nextQuestion === "function") {
        return safeTool.nextQuestion(container, nextContext);
      }

      if (typeof safeTool.next === "function") {
        return safeTool.next(nextContext);
      }

      return undefined;
    },
    showAnswer(containerOrContext, maybeContext = context) {
      const { container, nextContext } = splitRuntimeArgs(containerOrContext, maybeContext, currentContainer, context);
      currentContainer = container ?? currentContainer;

      if (typeof safeTool.showAnswer === "function") {
        return safeTool.showAnswer(container, nextContext);
      }

      return undefined;
    },
    getShellAnswerDisplayState(containerOrContext, maybeContext = context) {
      const { container, nextContext } = splitRuntimeArgs(containerOrContext, maybeContext, currentContainer, context);
      currentContainer = container ?? currentContainer;

      if (typeof safeTool.getShellAnswerDisplayState === "function") {
        return safeTool.getShellAnswerDisplayState(container, nextContext);
      }

      return {
        canToggle: false,
        mode: "correction"
      };
    },
    setShellAnswerDisplayMode(containerOrContext, maybeContext = context, mode = "correction") {
      const { container, nextContext } = splitRuntimeArgs(containerOrContext, maybeContext, currentContainer, context);
      currentContainer = container ?? currentContainer;

      if (typeof safeTool.setShellAnswerDisplayMode === "function") {
        return safeTool.setShellAnswerDisplayMode(container, nextContext, mode);
      }

      return false;
    },
    unmount(container = currentContainer, maybeContext = context) {
      const targetContainer = container ?? currentContainer;
      try {
        if (typeof safeTool.unmount === "function") {
          return safeTool.unmount(targetContainer, maybeContext);
        }
      } finally {
        currentContainer = null;
      }
      return undefined;
    }
  };

  runtime.nextQuestion = (containerOrContext, maybeContext = context) => runtime.next(containerOrContext, maybeContext);

  return runtime;
}

function splitRuntimeArgs(firstArg, secondArg, fallbackContainer, fallbackContext) {
  if (looksLikeDomContainer(firstArg)) {
    return {
      container: firstArg,
      nextContext: secondArg ?? fallbackContext
    };
  }

  return {
    container: fallbackContainer,
    nextContext: firstArg ?? fallbackContext
  };
}

function looksLikeDomContainer(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof Element !== "undefined" && value instanceof Element) return true;
  return value.nodeType === 1 || typeof value.appendChild === "function";
}

function normalizeCapabilityLevel(value, fallback) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (TOOL_RUNTIME_CAPABILITY_LEVELS.has(safeValue)) {
    return safeValue;
  }

  const safeFallback = String(fallback || "").trim().toLowerCase();
  if (TOOL_RUNTIME_CAPABILITY_LEVELS.has(safeFallback)) {
    return safeFallback;
  }

  return "supported";
}

function normalizeCapabilityModesList(value, fallback) {
  const rawValues = Array.isArray(value)
    ? value
    : value == null
      ? []
      : [value];

  const uniqueModes = [];
  rawValues.forEach((item) => {
    const normalized = String(item || "").trim().toLowerCase();
    if (!fallback.includes(normalized) && !TOOL_SUPPORTED_ADVANCE_MODES.has(normalized) && !TOOL_SUPPORTED_TIMING_MODES.has(normalized)) return;
    if (uniqueModes.includes(normalized)) return;
    uniqueModes.push(normalized);
  });

  return uniqueModes.length ? uniqueModes : [...fallback];
}

function normalizeActivityMode(value, fallback = "individual") {
  const safeValue = String(value || "").trim().toLowerCase();
  if (TOOL_ACTIVITY_MODES.includes(safeValue)) {
    return safeValue;
  }

  const safeFallback = String(fallback || "").trim().toLowerCase();
  return TOOL_ACTIVITY_MODES.includes(safeFallback) ? safeFallback : "individual";
}

function normalizeModeForRunProfile(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (TOOL_ACTIVITY_MODES.includes(safeValue)) {
    return safeValue;
  }
  return "individual";
}

function normalizeActivityModesList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : value == null
      ? []
      : [value];

  const uniqueModes = [];
  rawValues.forEach((item) => {
    const normalized = String(item || "").trim().toLowerCase();
    if (!TOOL_ACTIVITY_MODES.includes(normalized)) return;
    if (uniqueModes.includes(normalized)) return;
    uniqueModes.push(normalized);
  });

  return uniqueModes;
}

function normalizeActivityModeEntry(value, mode, { supportedModes = [], capabilities = null, tool = null, context = {} } = {}) {
  const safeMode = normalizeActivityMode(mode);
  const safeCapabilities = capabilities && typeof capabilities === "object" ? capabilities : null;
  const defaultSupported = supportedModes.includes(safeMode);
  const defaultReason = defaultSupported ? "" : `Cet outil n’est pas disponible en mode ${TOOL_ACTIVITY_MODE_LABELS[safeMode].toLowerCase()}.`;

  let supported = defaultSupported;
  let reason = defaultReason;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("supported" in value) {
      supported = value.supported !== false;
    } else if ("compatible" in value) {
      supported = value.compatible !== false;
    }

    if ("reason" in value) {
      reason = String(value.reason || "").trim();
    } else if ("blockingMessage" in value) {
      reason = String(value.blockingMessage || "").trim();
    }
  } else if (typeof value === "boolean") {
    supported = value;
    reason = value ? "" : defaultReason;
  } else if (typeof value === "string") {
    supported = value.trim().toLowerCase() !== "unsupported";
    reason = supported ? "" : value.trim();
  }

  if (!supported && !reason) {
    reason = defaultReason;
  }

  return {
    supported,
    reason: reason ? String(reason).trim() : ""
  };
}

function normalizeActivityModeProfile(rawProfile, {
  activityMode = "individual",
  tool = null,
  supportedModes = [],
  capabilities = null,
  context = {}
} = {}) {
  const safeTool = tool && typeof tool === "object" && !Array.isArray(tool) ? tool : {};
  const safeProfile = rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)
    ? rawProfile
    : {};
  const safeCapabilities = capabilities && typeof capabilities === "object" ? capabilities : normalizeRuntimeCapabilities({}, safeTool);
  const currentMode = normalizeActivityMode(activityMode);
  const explicitModes = normalizeActivityModesList(safeProfile.supportedModes ?? safeProfile.supportedActivityModes);
  const baseModes = explicitModes.length ? explicitModes : [...supportedModes];
  const normalized = {};

  TOOL_ACTIVITY_MODES.forEach((mode) => {
    const rawEntry = safeProfile[mode];
    normalized[mode] = normalizeActivityModeEntry(rawEntry, mode, {
      supportedModes: baseModes.length ? baseModes : TOOL_ACTIVITY_MODES,
      capabilities: safeCapabilities,
      tool: safeTool,
      context
    });
  });

  if (!explicitModes.length && safeProfile.compatible !== undefined) {
    const currentEntry = normalized[currentMode];
    currentEntry.supported = safeProfile.compatible !== false;
    currentEntry.reason = String(safeProfile.blockingMessage || currentEntry.reason || "").trim();
  }

  const supportedModeList = TOOL_ACTIVITY_MODES.filter((mode) => normalized[mode].supported !== false);
  const currentEntry = normalized[currentMode] ?? normalized.individual;
  const showCommonToolSettings = safeProfile.showCommonToolSettings !== false && safeCapabilities.supportsCommonFlowSettings !== false;

  return {
    activityMode: currentMode,
    supportedModes: supportedModeList,
    individual: normalized.individual,
    group: normalized.group,
    compatible: currentEntry.supported !== false,
    blockingMessage: String(currentEntry.reason || safeProfile.blockingMessage || "").trim(),
    showCommonToolSettings,
    supportsCommonFlowSettings: showCommonToolSettings,
    showSpecificToolSettings: safeProfile.showSpecificToolSettings !== false
  };
}
