export const COMMON_HELP_CONTENT = {
  "mode-passation": {
    title: "Mode de passation",
    bodyHtml: `
      <p>Le mode de passation définit le cadre général de l’activité&nbsp;: individuel ou collectif, avec ou sans réponse saisie, et évalué ou en entrainement.</p>
      <p>Ces réglages s’appliquent à toute l’activité.</p>
    `
  },
  "passation-mode": {
    title: "Individuel ou collectif",
    bodyHtml: `
      <p>Choisis si l’activité se joue seul ou à plusieurs.</p>
      <p>En collectif, le groupe avance dans la même séance.</p>
    `
  },
  "passation-response-ui": {
    title: "Réponse saisie",
    bodyHtml: `
      <p><strong>Réponse saisie</strong>&nbsp;: l’élève entre sa réponse dans l’outil.</p>
      <p><strong>Réponse non saisie</strong>&nbsp;: la réponse peut être donnée à l’oral, au tableau ou pilotée par l’enseignant.</p>
    `
  },
  "passation-progress-mode": {
    title: "Évaluation ou entrainement",
    bodyHtml: `
      <p><strong>Évaluation</strong>&nbsp;: la progression et les réussites sont suivies.</p>
      <p><strong>Entrainement</strong>&nbsp;: l’activité sert surtout à pratiquer, avec un suivi plus léger.</p>
    `
  },
  "questions-flow": {
    title: "Questions",
    bodyHtml: `
      <p><strong>Nombre fixe</strong>&nbsp;: l’outil pose un nombre défini de questions.</p>
      <p><strong>Illimitées</strong>&nbsp;: l’outil continue jusqu’à une durée limite, une action manuelle ou la fin de la séance.</p>
      <p><strong>Objectif de réussite</strong>&nbsp;: l’outil continue jusqu’à atteindre un nombre de réponses correctes.</p>
    `
  },
  "common-flow-overview": {
    title: "Déroulé de l’outil",
    bodyHtml: `
      <p>Cette section regroupe les réglages qui rythment l’outil sélectionné&nbsp;: les questions, les temps et la consigne.</p>
      <p>Ces choix s’appliquent uniquement à cet outil dans la séquence.</p>
    `
  },
  "common-flow-questions": {
    title: "Questions",
    bodyHtml: `
      <p><strong>Nombre fixe</strong>&nbsp;: l’outil pose le nombre de questions prévu, puis passe à la suite.</p>
      <p><strong>Illimitées</strong>&nbsp;: l’outil continue jusqu’à une limite de temps ou une action de fin.</p>
      <p><strong>Objectif de réussite</strong>&nbsp;: l’outil continue jusqu’au nombre de bonnes réponses indiqué. Les paliers évitent de rester bloqué trop longtemps.</p>
    `
  },
  "common-flow-timing": {
    title: "Temps",
    bodyHtml: `
      <p><strong>Temps par question</strong>&nbsp;: durée laissée pour répondre.</p>
      <p><strong>Temps d’affichage réponse</strong>&nbsp;: durée pendant laquelle la réponse ou la correction reste visible.</p>
      <p><strong>Temps entre les questions</strong>&nbsp;: pause avant la question suivante.</p>
      <p><strong>Durée maximale</strong>&nbsp;: limite globale de l’outil. Si elle est atteinte, la question en cours se termine avant de passer à la suite.</p>
    `
  },
  "common-flow-instruction": {
    title: "Consigne",
    bodyHtml: `
      <p>La consigne personnalisée remplace la consigne standard de l’outil pour cette activité.</p>
      <p><strong>Aucune consigne</strong>&nbsp;: la zone de consigne reste réservée dans l’outil, mais aucun texte n’est affiché.</p>
      <p>Laisse ce réglage désactivé pour garder la consigne prévue par l’outil.</p>
    `
  },
  "tool-max-time": {
    title: "Durée maximale",
    bodyHtml: `
      <p>La durée maximale limite le temps passé sur l’outil courant.</p>
      <p>Quand elle est atteinte, la séance passe à la suite selon le déroulé prévu.</p>
    `
  },
  "activity-total-time": {
    title: "Durée de l’activité",
    bodyHtml: `
      <p>Une durée totale fixe encadre toute l’activité.</p>
      <p>Le dernier outil sert alors à remplir le temps restant avec des questions illimitées.</p>
    `
  },
  "custom-instruction": {
    title: "Consigne personnalisée",
    bodyHtml: `
      <p>La consigne personnalisée remplace la consigne par défaut de l’outil pour cette activité.</p>
    `
  }
};

export function mergeHelpContent(...sources){
  return Object.assign({}, ...sources.filter((source) => source && typeof source === "object"));
}
