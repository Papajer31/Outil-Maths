import { renderMaterialIcon } from "../../shared/material-icons-svg.js";

const rocketOffUrl = new URL("../../shared/ui-assets/rocket-off.svg", import.meta.url).href;
const rocketOnUrl = new URL("../../shared/ui-assets/rocket-on.svg", import.meta.url).href;

/**
 * Construit le shell DOM commun d'une séance élève/projection.
 *
 * Ce module ne porte volontairement aucune logique métier et aucune adaptation
 * responsive : il centralise seulement le HTML stable et les références DOM du
 * shell existant, pour préparer les futurs patches sans modifier les outils.
 */
export function createSessionShell(root, options = {}) {
  const {
    currentMode = "individual",
    hasIndividualSidebar = false,
    isCatalogTestMode = false,
    isProjectedTeacherMode = false,
    isSharedSessionEntry = false
  } = options;

  root.innerHTML = `
    <div
      class="session-page ${isProjectedTeacherMode ? "session-page-projected" : ""} ${hasIndividualSidebar ? "session-page-has-sidebar" : "session-page-no-sidebar"} ${isCatalogTestMode ? "session-page-catalog-test" : ""}"
      id="sessionPage"
      data-activity-mode="${currentMode}"
    >
      <div id="sessionViewport" class="session-viewport">
        <div id="sessionFitHost" class="session-fit-host">
          <div id="sessionSceneFrame" class="session-scene-frame">
            <div id="sessionScene" class="session-scene ${hasIndividualSidebar ? "session-scene-has-sidebar" : "session-scene-centered"}">
              <div class="session-chrome-top">
                <div class="session-top-slot session-top-slot-left">
                  ${isSharedSessionEntry || isCatalogTestMode ? "" : `
                    <button
                      class="student-nav-btn student-nav-back student-session-back"
                      id="btnBackToActivities"
                      type="button"
                      aria-label="Retour"
                      data-skip-autofs="true"
                    >
                      ${renderMaterialIcon("arrow_back")}
                    </button>
                  `}
                </div>

                <div class="session-top-slot session-top-slot-center">
                  <div id="globalTimer" class="timer hidden" aria-hidden="true">
                    <div class="timer-bar" id="timerBar"></div>
                  </div>
                </div>

                <div class="session-top-slot session-top-slot-right">
                  ${isCatalogTestMode ? "" : `
                    <button
                      class="student-nav-btn student-nav-action student-session-pause"
                      id="btnPause"
                      title="Pause"
                      type="button"
                      aria-label="Pause"
                      data-skip-autofs="true"
                    >
                      ${renderMaterialIcon("pause", { className: "student-icon", id: "btnPauseIcon" })}
                    </button>
                  `}
                </div>
              </div>

              <div class="session-content-band">
                <div class="session-sidebar-reserve session-sidebar-reserve-left"${isProjectedTeacherMode ? "" : ' aria-hidden="true"'}>
                  ${isProjectedTeacherMode ? `
                    <aside class="projected-teacher-dock" id="projectedTeacherDock" aria-label="Commandes de projection" data-skip-autofs="true">
                      <div class="projected-teacher-dock-head">
                        <strong id="projectedTeacherActivityTitle">Activité</strong>
                        <span id="projectedTeacherActivityPosition">1 / 1</span>
                      </div>

                      <button class="projected-teacher-dock-btn" id="btnProjectedRestart" type="button" title="Relancer cette activité" aria-label="Relancer cette activité" data-skip-autofs="true">
                        ${renderMaterialIcon("refresh", { className: "student-icon projected-teacher-dock-icon" })}
                        <span>Relancer</span>
                      </button>

                      <button class="projected-teacher-dock-btn" id="btnPrevTool" type="button" title="Outil précédent" aria-label="Outil précédent" data-skip-autofs="true">
                        ${renderMaterialIcon("skip_previous", { className: "student-icon projected-teacher-dock-icon" })}
                        <span>Outil −</span>
                      </button>

                      <button class="projected-teacher-dock-btn" id="btnNextTool" type="button" title="Outil suivant" aria-label="Outil suivant" data-skip-autofs="true">
                        ${renderMaterialIcon("skip_next", { className: "student-icon projected-teacher-dock-icon" })}
                        <span>Outil +</span>
                      </button>

                      <div class="projected-teacher-level-block">
                        <span class="projected-teacher-level-label">Niveau</span>
                        <div class="projected-teacher-levels" role="group" aria-label="Niveau de l’activité courante">
                          ${[1,2,3,4,5].map((level) => `
                            <button class="projected-teacher-level-btn" type="button" data-projected-level="${level}" aria-label="Niveau ${level}" aria-pressed="false" data-skip-autofs="true">${level}</button>
                          `).join("")}
                        </div>
                      </div>
                    </aside>
                  ` : ""}
                </div>
                <div class="session-content-main-wrap">
                  <div id="sessionWorkArea" class="session-workarea"></div>
                </div>
                <div class="session-sidebar-reserve session-sidebar-reserve-right">
                  <aside class="session-final-challenge-panel hidden" id="sessionFinalChallengePanel" aria-label="Défi final">
                    <div class="session-final-challenge-title">Défi final</div>
                    <div class="session-final-challenge-metric">
                      <span class="session-final-challenge-label">Temps</span>
                      <span class="session-final-challenge-value" id="sessionFinalChallengeTime">--:--</span>
                    </div>
                    <div class="session-final-challenge-metric">
                      <span class="session-final-challenge-label">Réussites</span>
                      <span class="session-final-challenge-value" id="sessionFinalChallengeScore">0</span>
                    </div>
                  </aside>
                  <aside class="session-evaluation-counter-shell hidden" id="sessionEvaluationCounterShell" aria-label="Compteur de réussite" hidden aria-hidden="true">
                    <div class="session-evaluation-counter-metric">
                      <span class="session-evaluation-counter-label">Questions posées</span>
                      <span class="session-evaluation-counter-value" id="sessionEvaluationCounterQuestions">0</span>
                    </div>
                    <div class="session-evaluation-counter-metric">
                      <span class="session-evaluation-counter-label">Réponses correctes</span>
                      <span class="session-evaluation-counter-value" id="sessionEvaluationCounterCorrect">0</span>
                    </div>
                  </aside>
                  <aside class="session-fixed-question-counter-shell session-evaluation-counter-shell hidden" id="sessionFixedQuestionCounterShell" aria-label="Question courante" hidden aria-hidden="true">
                    <div class="session-evaluation-counter-metric">
                      <span class="session-evaluation-counter-label">Question</span>
                      <span class="session-evaluation-counter-value session-fixed-question-counter-value" id="sessionFixedQuestionCounterValue">0 / 0</span>
                    </div>
                  </aside>
                  <aside class="session-progress-shell hidden" id="sessionProgressShell" aria-label="Progression de la séance" hidden aria-hidden="true">
                    <div class="session-progress-gauge" id="sessionProgressGauge" data-mode="pending">
                      <div class="session-progress-rocket-wrap" id="sessionProgressRocketWrap" aria-hidden="true">
                        <img class="session-progress-rocket session-progress-rocket-off" src="${rocketOffUrl}" alt="" draggable="false">
                        <img class="session-progress-rocket session-progress-rocket-on" src="${rocketOnUrl}" alt="" draggable="false">
                      </div>
                      <div class="session-progress-track-shell">
                        <div class="session-progress-track" id="sessionProgressTrack"></div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>

              <div class="session-chrome-bottom">
                <div class="session-bottom-slot session-bottom-slot-left" aria-hidden="true"></div>
                <div class="session-bottom-slot session-bottom-slot-center">
                  <div class="session-shell-controls" id="sessionShellControls" data-skip-autofs="true">
                    <button
                      class="student-manual-btn session-answer-toggle-btn hidden"
                      id="btnAnswerDisplayToggle"
                      type="button"
                      title="Voir ma réponse"
                      aria-label="Voir ma réponse"
                      data-skip-autofs="true"
                    >
                      ${renderMaterialIcon("sync_alt", { className: "student-icon session-shell-btn-icon" })}
                      <span class="session-shell-btn-label">Voir ma réponse</span>
                    </button>
                    <button
                      class="student-manual-btn hidden"
                      id="btnManualAction"
                      type="button"
                      data-skip-autofs="true"
                    ></button>
                  </div>
                </div>
                <div class="session-bottom-slot session-bottom-slot-right">
                  <div
                    class="session-tool-countdown-pill hidden"
                    id="sessionToolCountdownPill"
                    aria-hidden="true"
                  ></div>
                </div>
              </div>

              <div
                id="sessionStageLayer"
                class="hidden session-stage-layer"
                aria-live="polite"
              ></div>
              <div
                id="sessionConfirmLayer"
                class="hidden session-confirm-layer"
                aria-live="polite"
                data-skip-autofs="true"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return {
    els: getSessionShellRefs(root)
  };
}

export function getSessionShellRefs(root) {
  return {
    page: root.querySelector("#sessionPage"),
    btnBackToActivities: root.querySelector("#btnBackToActivities"),
    btnPause: root.querySelector("#btnPause"),
    btnPauseIcon: root.querySelector("#btnPauseIcon"),
    btnPrevTool: root.querySelector("#btnPrevTool"),
    btnShowAnswer: root.querySelector("#btnShowAnswer"),
    btnNextQuestion: root.querySelector("#btnNextQuestion"),
    answerDisplayToggleBtn: root.querySelector("#btnAnswerDisplayToggle"),
    btnNextTool: root.querySelector("#btnNextTool"),
    btnProjectedRestart: root.querySelector("#btnProjectedRestart"),
    projectedTeacherDock: root.querySelector("#projectedTeacherDock"),
    projectedTeacherActivityTitle: root.querySelector("#projectedTeacherActivityTitle"),
    projectedTeacherActivityPosition: root.querySelector("#projectedTeacherActivityPosition"),
    projectedLevelButtons: Array.from(root.querySelectorAll("[data-projected-level]")),
    manualActionBtn: root.querySelector("#btnManualAction"),
    viewport: root.querySelector("#sessionViewport"),
    fitHost: root.querySelector("#sessionFitHost"),
    sceneFrame: root.querySelector("#sessionSceneFrame"),
    scene: root.querySelector("#sessionScene"),
    workArea: root.querySelector("#sessionWorkArea"),
    rightReserve: root.querySelector(".session-sidebar-reserve-right"),
    progressShell: root.querySelector("#sessionProgressShell"),
    progressGauge: root.querySelector("#sessionProgressGauge"),
    progressTrack: root.querySelector("#sessionProgressTrack"),
    progressRocketWrap: root.querySelector("#sessionProgressRocketWrap"),
    evaluationCounterShell: root.querySelector("#sessionEvaluationCounterShell"),
    evaluationCounterQuestions: root.querySelector("#sessionEvaluationCounterQuestions"),
    evaluationCounterCorrect: root.querySelector("#sessionEvaluationCounterCorrect"),
    fixedQuestionCounterShell: root.querySelector("#sessionFixedQuestionCounterShell"),
    fixedQuestionCounterValue: root.querySelector("#sessionFixedQuestionCounterValue"),
    finalChallengePanel: root.querySelector("#sessionFinalChallengePanel"),
    finalChallengeTime: root.querySelector("#sessionFinalChallengeTime"),
    finalChallengeScore: root.querySelector("#sessionFinalChallengeScore"),
    toolCountdownPill: root.querySelector("#sessionToolCountdownPill"),
    stageLayer: root.querySelector("#sessionStageLayer"),
    confirmLayer: root.querySelector("#sessionConfirmLayer"),
    timer: root.querySelector("#globalTimer"),
    timerBar: root.querySelector("#timerBar")
  };
}
