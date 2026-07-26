const RESOURCE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;
const MAX_RESOURCE_FILE_SIZE = 25 * 1024 * 1024;
const MAX_RECORDING_DURATION_MS = 5 * 60 * 1000;

export function createDefaultAudioRecordingTitle(date = new Date()) {
  const datePart = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(":", " h ");
  return `Enregistrement — ${datePart} à ${timePart}`;
}

export function openAudioRecorderDialog({
  teacherSpaceId,
  destinationFolderId = null,
  ensureDestinationFolder = null,
  listResourcesForSpace,
  uploadResourceForSpace,
  defaultTitle = "",
  showToast = null
} = {}) {
  return new Promise((resolve) => {
    let mediaStream = null;
    let mediaRecorder = null;
    let chunks = [];
    let recordedBlob = null;
    let recordedDuration = 0;
    let previewUrl = "";
    let startedAt = 0;
    let timer = 0;
    let limitTimer = 0;
    let waveformFrame = 0;
    let audioContext = null;
    let analyserNode = null;
    let waveformData = null;
    let waveformLevels = [];
    let isStarting = false;
    let isNameEditingEnabled = false;
    let closed = false;
    let isSaving = false;

    const overlay = document.createElement("div");
    overlay.className = "dashboard-audio-recorder-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "dashboardAudioRecorderTitle");
    overlay.innerHTML = `
      <section class="dashboard-audio-recorder-card">
        <header class="dashboard-audio-recorder-header">
          <h2 id="dashboardAudioRecorderTitle">Enregistrer un audio</h2>
          <div class="dashboard-audio-recorder-message" data-audio-recorder-message aria-live="polite"></div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-audio-recorder-close aria-label="Fermer" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="dashboard-audio-recorder-body">
          <div class="dashboard-audio-recorder-name">
            <label for="dashboardAudioRecorderName">Nom :</label>
            <input id="dashboardAudioRecorderName" type="text" maxlength="160" data-audio-recorder-name value="${escapeAttr(defaultTitle || createDefaultAudioRecordingTitle())}" disabled>
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-audio-recorder-edit-name aria-label="Modifier le nom" title="Modifier le nom">
              <span class="dashboard-material-icon" aria-hidden="true">edit</span>
            </button>
          </div>

          <div class="dashboard-audio-recorder-stage">
            <div class="dashboard-audio-recorder-meter" data-audio-recorder-meter>
              <div class="dashboard-audio-recorder-clock" data-audio-recorder-clock>0:00</div>
              <div class="dashboard-audio-recorder-waveform" data-audio-recorder-waveform aria-hidden="true">
                ${Array.from({ length: 36 }, () => "<span></span>").join("")}
              </div>
            </div>
            <div class="dashboard-audio-recorder-preview" data-audio-recorder-preview hidden>
              <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-audio-recorder-player-toggle aria-label="Lire l’enregistrement" title="Lire l’enregistrement">
                <span class="dashboard-material-icon" aria-hidden="true" data-audio-recorder-player-icon>play_arrow</span>
              </button>
              <input class="dashboard-audio-recorder-progress" type="range" min="0" max="0" value="0" step="0.01" data-audio-recorder-progress aria-label="Progression de l’enregistrement">
              <span class="dashboard-audio-recorder-player-time" data-audio-recorder-player-time>0:00 / 0:00</span>
              <audio preload="metadata" data-audio-recorder-player></audio>
            </div>
            <div class="dashboard-audio-recorder-controls">
              <button class="btn primary dashboard-btn-with-icon" type="button" data-audio-recorder-toggle>
                <span class="dashboard-material-icon" aria-hidden="true" data-audio-recorder-toggle-icon>radio_button_checked</span>
                <span data-audio-recorder-toggle-label>Démarrer</span>
              </button>
              <button class="btn dashboard-btn-with-icon" type="button" data-audio-recorder-reset hidden>
                <span class="dashboard-material-icon" aria-hidden="true">refresh</span>
                Recommencer
              </button>
              <button class="btn primary dashboard-btn-with-icon" type="button" data-audio-recorder-save disabled hidden>
                <span class="dashboard-material-icon" aria-hidden="true">save</span>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const clock = overlay.querySelector("[data-audio-recorder-clock]");
    const message = overlay.querySelector("[data-audio-recorder-message]");
    const toggleButton = overlay.querySelector("[data-audio-recorder-toggle]");
    const toggleIcon = overlay.querySelector("[data-audio-recorder-toggle-icon]");
    const toggleLabel = overlay.querySelector("[data-audio-recorder-toggle-label]");
    const resetButton = overlay.querySelector("[data-audio-recorder-reset]");
    const saveButton = overlay.querySelector("[data-audio-recorder-save]");
    const nameInput = overlay.querySelector("[data-audio-recorder-name]");
    const editNameButton = overlay.querySelector("[data-audio-recorder-edit-name]");
    const meter = overlay.querySelector("[data-audio-recorder-meter]");
    const preview = overlay.querySelector("[data-audio-recorder-preview]");
    const player = overlay.querySelector("[data-audio-recorder-player]");
    const playerToggle = overlay.querySelector("[data-audio-recorder-player-toggle]");
    const playerIcon = overlay.querySelector("[data-audio-recorder-player-icon]");
    const playerProgress = overlay.querySelector("[data-audio-recorder-progress]");
    const playerTime = overlay.querySelector("[data-audio-recorder-player-time]");
    const bars = Array.from(overlay.querySelectorAll("[data-audio-recorder-waveform] span"));

    const setMessage = (text = "", isError = false) => {
      if (!message) return;
      message.textContent = text;
      message.classList.toggle("is-error", Boolean(isError));
    };

    const setRecordButtonState = (recording, { disabled = false } = {}) => {
      if (!toggleButton) return;
      toggleButton.disabled = disabled;
      toggleButton.classList.toggle("is-recording", Boolean(recording));
      if (toggleIcon) toggleIcon.textContent = recording ? "stop" : "radio_button_checked";
      if (toggleLabel) toggleLabel.textContent = recording ? "Arrêter" : "Démarrer";
    };

    const syncPlayer = () => {
      const duration = Number.isFinite(player?.duration) ? player.duration : recordedDuration;
      const currentTime = Math.min(Math.max(0, Number(player?.currentTime) || 0), duration || 0);
      if (playerProgress) {
        playerProgress.max = String(duration || 0);
        playerProgress.value = String(currentTime);
      }
      if (playerTime) playerTime.textContent = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;
      if (playerIcon) playerIcon.textContent = player?.paused ? "play_arrow" : "pause";
      if (playerToggle) {
        const label = player?.paused ? "Lire l’enregistrement" : "Mettre en pause";
        playerToggle.setAttribute("aria-label", label);
        playerToggle.title = label;
      }
    };

    const showPreview = (visible) => {
      if (meter) meter.hidden = Boolean(visible);
      if (preview) preview.hidden = !visible;
    };

    const setBusy = (busy) => {
      isSaving = Boolean(busy);
      overlay.classList.toggle("is-busy", isSaving);
      setRecordButtonState(mediaRecorder?.state === "recording", { disabled:isSaving || isStarting });
      resetButton.disabled = isSaving;
      nameInput.disabled = isSaving || !isNameEditingEnabled;
      if (editNameButton) editNameButton.disabled = isSaving;
      saveButton.disabled = isSaving || !recordedBlob;
      overlay.querySelectorAll("[data-audio-recorder-close]").forEach((button) => {
        button.disabled = isSaving;
      });
    };

    const clearTimers = () => {
      if (timer) window.clearInterval(timer);
      if (limitTimer) window.clearTimeout(limitTimer);
      timer = 0;
      limitTimer = 0;
    };

    const resetWaveform = () => {
      waveformLevels = bars.map(() => .12);
      bars.forEach((bar) => { bar.style.transform = "scaleY(.12)"; });
    };

    const stopWaveform = () => {
      if (waveformFrame) window.cancelAnimationFrame(waveformFrame);
      waveformFrame = 0;
      analyserNode = null;
      waveformData = null;
      waveformLevels = [];
      if (audioContext) {
        const context = audioContext;
        audioContext = null;
        void context.close?.().catch?.(() => {});
      }
      resetWaveform();
    };

    const startWaveform = (stream) => {
      stopWaveform();
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass || !stream) return;
      try {
        audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = .58;
        waveformData = new Uint8Array(analyserNode.fftSize);
        source.connect(analyserNode);

        const draw = () => {
          if (!analyserNode || mediaRecorder?.state !== "recording") return;
          analyserNode.getByteTimeDomainData(waveformData);
          let totalEnergy = 0;
          for (const sample of waveformData) totalEnergy += Math.abs(sample - 128);
          const globalEnergy = totalEnergy / waveformData.length;
          bars.forEach((bar, index) => {
            const start = Math.floor(index * waveformData.length / bars.length);
            const end = Math.max(start + 1, Math.floor((index + 1) * waveformData.length / bars.length));
            let total = 0;
            for (let sampleIndex = start; sampleIndex < end; sampleIndex++) total += Math.abs((waveformData[sampleIndex] || 128) - 128);
            const localEnergy = total / Math.max(1, end - start);
            const energy = (localEnergy * .7) + (globalEnergy * .3);
            const target = Math.max(.12, Math.min(1, .12 + (energy / 25)));
            const previous = waveformLevels[index] ?? .12;
            const level = previous + ((target - previous) * .28);
            waveformLevels[index] = level;
            bar.style.transform = `scaleY(${level})`;
          });
          waveformFrame = window.requestAnimationFrame(draw);
        };
        draw();
      } catch (error) {
        console.warn("Impossible d’afficher le niveau du microphone.", error);
        stopWaveform();
      }
    };

    const stopStream = () => {
      mediaStream?.getTracks?.().forEach((track) => track.stop());
      mediaStream = null;
    };

    const cleanup = () => {
      clearTimers();
      stopWaveform();
      if (mediaRecorder?.state === "recording") {
        try { mediaRecorder.stop(); } catch {}
      }
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      document.removeEventListener("keydown", handleKeyDown, true);
      overlay.remove();
    };

    const close = (result = null) => {
      if (closed || isSaving) return;
      closed = true;
      cleanup();
      resolve(result);
    };

    const updateClock = () => {
      const elapsed = startedAt ? Math.min(MAX_RECORDING_DURATION_MS, Date.now() - startedAt) / 1000 : 0;
      if (clock) clock.textContent = formatDuration(elapsed);
    };

    const resetRecording = () => {
      clearTimers();
      stopWaveform();
      if (mediaRecorder?.state === "recording") {
        try { mediaRecorder.stop(); } catch {}
      }
      stopStream();
      mediaRecorder = null;
      isStarting = false;
      chunks = [];
      recordedBlob = null;
      recordedDuration = 0;
      startedAt = 0;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      player?.pause?.();
      player?.removeAttribute("src");
      player?.load?.();
      showPreview(false);
      if (resetButton) resetButton.hidden = true;
      if (saveButton) saveButton.hidden = true;
      if (clock) clock.textContent = "0:00";
      resetWaveform();
      setMessage();
      setBusy(false);
    };

    const stopRecording = () => {
      if (mediaRecorder?.state === "recording") {
        try { mediaRecorder.stop(); } catch {}
      }
    };

    const startRecording = async () => {
      if (isStarting || mediaRecorder?.state === "recording") return;
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
        setMessage("L’enregistrement audio n’est pas disponible dans ce navigateur.", true);
        return;
      }
      resetRecording();
      isStarting = true;
      setRecordButtonState(false, { disabled:true });
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (closed) {
          stopStream();
          return;
        }
        const mimeType = getSupportedRecorderMimeType();
        mediaRecorder = mimeType
          ? new MediaRecorder(mediaStream, { mimeType })
          : new MediaRecorder(mediaStream);
        chunks = [];
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data?.size) chunks.push(event.data);
        });
        mediaRecorder.addEventListener("stop", () => {
          clearTimers();
          stopWaveform();
          recordedDuration = Math.max(.1, (Date.now() - startedAt) / 1000);
          recordedBlob = new Blob(chunks, { type: mediaRecorder?.mimeType || mimeType || "audio/webm" });
          stopStream();
          if (closed) return;
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(recordedBlob);
          if (player) {
            player.src = previewUrl;
            player.load();
          }
          showPreview(true);
          syncPlayer();
          if (resetButton) resetButton.hidden = false;
          if (saveButton) saveButton.hidden = false;
          setMessage();
          if (saveButton) saveButton.disabled = false;
          setRecordButtonState(false);
          updateClock();
        }, { once: true });
        mediaRecorder.start();
        startWaveform(mediaStream);
        startedAt = Date.now();
        isStarting = false;
        setMessage("Enregistrement en cours…");
        setRecordButtonState(true);
        if (saveButton) saveButton.disabled = true;
        timer = window.setInterval(updateClock, 160);
        limitTimer = window.setTimeout(stopRecording, MAX_RECORDING_DURATION_MS);
        updateClock();
      } catch (error) {
        stopStream();
        mediaRecorder = null;
        isStarting = false;
        setRecordButtonState(false);
        const text = error?.name === "NotAllowedError"
          ? "Accès au microphone refusé."
          : "Impossible d’utiliser le microphone.";
        setMessage(text, true);
      }
    };

    const saveRecording = async () => {
      if (!recordedBlob || isSaving) return;
      const title = String(nameInput?.value || "").trim();
      if (!title) {
        setMessage("Donnez un nom à la ressource.", true);
        nameInput?.focus();
        return;
      }
      if (recordedBlob.size > MAX_RESOURCE_FILE_SIZE) {
        setMessage("Cet enregistrement dépasse la limite de 25 Mo.", true);
        return;
      }
      if (typeof listResourcesForSpace !== "function" || typeof uploadResourceForSpace !== "function") {
        setMessage("La gestion des ressources personnelles n’est pas disponible.", true);
        return;
      }

      setBusy(true);
      setMessage("Enregistrement dans les ressources…");
      try {
        const resources = await listResourcesForSpace(teacherSpaceId);
        const usedBytes = (Array.isArray(resources) ? resources : [])
          .filter((resource) => resource?.is_system !== true)
          .reduce((total, resource) => total + Math.max(0, Number(resource?.size_bytes) || 0), 0);
        if (usedBytes + recordedBlob.size > RESOURCE_STORAGE_QUOTA_BYTES) {
          throw new Error("Le quota de stockage personnel de 100 Mo serait dépassé.");
        }

        let folderId = destinationFolderId;
        if (typeof ensureDestinationFolder === "function") {
          const folder = await ensureDestinationFolder();
          folderId = folder?.id ?? folderId;
        }

        const extension = getAudioExtension(recordedBlob.type);
        const file = new File([recordedBlob], `enregistrement.${extension}`, {
          type: recordedBlob.type || "audio/webm",
          lastModified: Date.now()
        });
        const resource = await uploadResourceForSpace(teacherSpaceId, file, {
          folder_id: folderId,
          title,
          alt: title,
          type: "audio",
          mime_type: file.type,
          duration: recordedDuration,
          metadata: {
            origin: "recording",
            recorded_at: new Date().toISOString()
          }
        });
        if (!resource?.id) throw new Error("La ressource audio n’a pas été créée.");
        showToast?.(`Audio « ${resource.title || title} » enregistré.`);
        isSaving = false;
        closed = true;
        cleanup();
        resolve(resource);
      } catch (error) {
        console.error("Impossible d’enregistrer la ressource audio.", error);
        setBusy(false);
        setMessage(error?.message || "Impossible d’enregistrer cette ressource audio.", true);
      }
    };

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-audio-recorder-close]")) {
        close(null);
        return;
      }
      if (event.target.closest("[data-audio-recorder-toggle]")) {
        if (mediaRecorder?.state === "recording") stopRecording();
        else void startRecording();
      }
      if (event.target.closest("[data-audio-recorder-reset]")) resetRecording();
      if (event.target.closest("[data-audio-recorder-save]")) void saveRecording();
      if (event.target.closest("[data-audio-recorder-edit-name]")) {
        isNameEditingEnabled = true;
        nameInput.disabled = false;
        editNameButton.hidden = true;
        nameInput.focus();
        nameInput.select();
      }
      if (event.target.closest("[data-audio-recorder-player-toggle]")) {
        if (player?.paused) void player.play?.();
        else player?.pause?.();
      }
    });
    player?.addEventListener("loadedmetadata", syncPlayer);
    player?.addEventListener("durationchange", syncPlayer);
    player?.addEventListener("timeupdate", syncPlayer);
    player?.addEventListener("play", syncPlayer);
    player?.addEventListener("pause", syncPlayer);
    player?.addEventListener("ended", syncPlayer);
    playerProgress?.addEventListener("input", () => {
      if (!player || !Number.isFinite(player.duration)) return;
      player.currentTime = Math.min(Math.max(0, Number(playerProgress.value) || 0), player.duration);
      syncPlayer();
    });
    document.addEventListener("keydown", handleKeyDown, true);
    window.requestAnimationFrame(() => editNameButton?.focus());
  });
}

function getSupportedRecorderMimeType() {
  const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => globalThis.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function getAudioExtension(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mp4") || value.includes("m4a")) return "m4a";
  if (value.includes("wav")) return "wav";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  return "webm";
}

function formatDuration(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
