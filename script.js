(() => {
  "use strict";

  const API_BASE = "https://mental-health-score-predictor-as7d.onrender.com";
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- element refs ---------- */
  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");
  const exampleBtn = document.getElementById("example-btn");
  const clearBtn = document.getElementById("clear-btn");

  const progressValueEl = document.getElementById("form-progress-value");
  const progressBarEl = document.getElementById("form-progress-bar");
  const idleProgressEl = document.getElementById("idle-progress-dot");
  const resultAnnouncer = document.getElementById("result-announcer");
  const resultPanel = document.getElementById("result-panel");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const gaugeNeedle = document.getElementById("gauge-needle");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");
  const loadingLabelEl = document.getElementById("loading-label");
  const loadingCopyEl = document.getElementById("loading-copy");

  const GAUGE_ARC_LENGTH = 314;
  const requiredFields = () => [...form.querySelectorAll("[required]")];

  /* =========================================================
     FIELD STATE / VALIDATION (unchanged behaviour)
     ========================================================= */
  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
    if (input) input.setAttribute("aria-invalid", "false");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    void wrap.offsetWidth; // restart shake animation
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
    if (input) input.setAttribute("aria-invalid", "true");
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => {
      f.classList.remove("field-error", "field-valid");
      const err = f.querySelector(".error-msg");
      if (err) err.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
  }

  function markValidField(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    wrap.classList.add("field-valid");
    input.setAttribute("aria-invalid", "false");
  }

  function isFieldComplete(input) {
    if (!input) return false;
    if (input.type === "hidden") return Boolean(input.value && input.value.trim() !== "");
    const value = input.value.trim();
    if (value === "") return false;
    if (input.type === "number") return Number.isFinite(Number(value)) && input.checkValidity();
    return input.checkValidity();
  }

  function updateFormProgress() {
    const fields = requiredFields();
    let complete = 0;
    fields.forEach((field) => {
      const wrap = fieldWrapper(field);
      const isComplete = isFieldComplete(field);
      if (wrap && isComplete) markValidField(field);
      else if (wrap) wrap.classList.remove("field-valid");
      if (isComplete) complete += 1;
    });

    const total = Math.max(fields.length, 1);
    const percent = Math.round((complete / total) * 100);
    progressValueEl.textContent = `${percent}%`;
    progressBarEl.style.width = `${percent}%`;
    if (idleProgressEl) idleProgressEl.style.width = `${percent}%`;
  }

  /* =========================================================
     GAUGE TICKS
     ========================================================= */
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (cx + rOuter * Math.cos(angle)).toFixed(1));
        line.setAttribute("y1", (cy - rOuter * Math.sin(angle)).toFixed(1));
        line.setAttribute("x2", (cx + rInner * Math.cos(angle)).toFixed(1));
        line.setAttribute("y2", (cy - rInner * Math.sin(angle)).toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  /* =========================================================
     STRESS SEGMENTED CONTROL
     ========================================================= */
  const segGroup = document.getElementById("stress_level_group");
  const segButtons = [...segGroup.querySelectorAll(".seg-btn")];
  const stressHiddenInput = document.getElementById("stress_level");

  function selectStress(value) {
    segButtons.forEach((b) => {
      const on = b.dataset.value === value;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    stressHiddenInput.value = value || "";
  }

  function resetStressSelection() {
    selectStress("");
    stressHiddenInput.setAttribute("aria-invalid", "false");
  }

  segButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      selectStress(btn.dataset.value);
      clearFieldError(stressHiddenInput);
      updateFormProgress();
    });
    btn.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const next = segButtons[(idx + keys[e.key] + segButtons.length) % segButtons.length];
      next.focus();
      next.click();
    });
  });

  /* =========================================================
     SLIDERS <-> NUMBER INPUTS
     ========================================================= */
  const sliders = [...form.querySelectorAll(".slider")];

  function paintSlider(slider) {
    const min = Number(slider.min), max = Number(slider.max);
    const pct = ((Number(slider.value) - min) / (max - min)) * 100;
    slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
  }

  function syncSlidersFromInputs() {
    sliders.forEach((s) => {
      const input = document.getElementById(s.dataset.target);
      const v = input.value === "" ? 0 : Number(input.value);
      s.value = Number.isFinite(v) ? Math.min(v, Number(s.max)) : 0;
      paintSlider(s);
    });
  }

  sliders.forEach((s) => {
    paintSlider(s);
    s.addEventListener("input", () => {
      const input = document.getElementById(s.dataset.target);
      input.value = s.value;
      paintSlider(s);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  /* =========================================================
     LIVE "YOUR 24 HOURS" MAP + QUICK NOTES
     ========================================================= */
  const dm = {
    total: document.getElementById("daymap-total"),
    sleep: document.getElementById("seg-sleep"),
    study: document.getElementById("seg-study"),
    move: document.getElementById("seg-move"),
    screen: document.getElementById("seg-screen"),
    lgSleep: document.getElementById("lg-sleep"),
    lgStudy: document.getElementById("lg-study"),
    lgMove: document.getElementById("lg-move"),
    lgScreen: document.getElementById("lg-screen"),
    insights: document.getElementById("insights"),
  };

  const num = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const hasVal = (id) => document.getElementById(id).value.trim() !== "";
  const fmt = (n) => `${(Math.round(n * 10) / 10).toString()}h`;

  function updateDayMap() {
    const sleep = num("sleep_hours_per_night");
    const study = num("study_hours");
    const move = num("physical_activity_hours");
    const screen = num("avg_daily_usage_hours");
    const sum = sleep + study + move + screen;
    const scale = Math.max(sum, 24); // never overflow the bar

    const w = (v) => `${(v / scale) * 100}%`;
    dm.sleep.style.width = w(sleep);
    dm.study.style.width = w(study);
    dm.move.style.width = w(move);
    dm.screen.style.width = w(screen);

    dm.lgSleep.textContent = fmt(sleep);
    dm.lgStudy.textContent = fmt(study);
    dm.lgMove.textContent = fmt(move);
    dm.lgScreen.textContent = fmt(screen);

    const over = sum > 24;
    dm.total.textContent = over
      ? `${fmt(sum)} — overlaps (e.g. studying on a screen)`
      : `${(Math.round(sum * 10) / 10).toFixed(1)} / 24 hrs tracked`;
    dm.total.classList.toggle("over", over);

    const chips = [];
    if (hasVal("sleep_hours_per_night")) {
      if (sleep < 6) chips.push(["warn", "Short on sleep"]);
      else if (sleep >= 7 && sleep <= 9) chips.push(["good", "Sleep in a healthy range"]);
    }
    if (hasVal("avg_daily_usage_hours")) {
      if (screen >= 7) chips.push(["warn", "Heavy screen time"]);
      else if (screen <= 3) chips.push(["good", "Light screen time"]);
    }
    if (hasVal("physical_activity_hours")) {
      if (move < 0.5) chips.push(["warn", "Little movement"]);
      else if (move >= 1) chips.push(["good", "Active day"]);
    }
    if (hasVal("daily_unlocks") && num("daily_unlocks") >= 100) {
      chips.push(["warn", "Frequent phone checks"]);
    }

    dm.insights.innerHTML = "";
    chips.forEach(([kind, text]) => {
      const el = document.createElement("span");
      el.className = `chip ${kind}`;
      el.textContent = text;
      dm.insights.appendChild(el);
    });
  }

  /* =========================================================
     PAYLOAD + VALIDATION
     ========================================================= */
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) errors.push([stressHiddenInput, "Pick a stress level."]);

    return errors;
  }

  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : parseInt(fd.get("age"), 10),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  /* =========================================================
     RESULT STATES
     ========================================================= */
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
    resultPanel.classList.toggle("has-result", name === "result");
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  const BANDS = {
    veryLow:  { rgb: "255, 107, 107", hex: "#FF6B6B" },
    strained: { rgb: "255, 200, 87",  hex: "#FFC857" },
    balanced: { rgb: "47, 196, 201",  hex: "#2FC4C9" },
    thriving: { rgb: "61, 220, 151",  hex: "#3DDC97" },
  };

  function setAccent(rgb) {
    document.documentElement.style.setProperty("--accent-rgb", rgb);
    document.documentElement.style.setProperty("--accent", `rgb(${rgb})`);
  }

  function bandFor(score) {
    if (score < 2) {
      return {
        key: "veryLow",
        label: "Signal: needs care",
        context: "Your responses point to heavy strain right now. Consider talking to someone you trust, and start with small changes to sleep and screen time.",
      };
    }
    if (score < 5) {
      return {
        key: "strained",
        label: "Signal: strained",
        context: "Some areas of your routine look under pressure. Small shifts in sleep, activity or screen time can help.",
      };
    }
    if (score < 8) {
      return {
        key: "balanced",
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      key: "thriving",
      label: "Signal: thriving",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function animateNumber(target) {
    const start = Number(scoreNumberEl.dataset.value || 0);
    const startTime = performance.now();
    const duration = 1100;

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      scoreNumberEl.textContent = (start + (target - start) * eased).toFixed(2);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        scoreNumberEl.textContent = target.toFixed(2);
        scoreNumberEl.dataset.value = String(target);
      }
    };
    requestAnimationFrame(tick);
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { key, label, context } = bandFor(clamped);

    setAccent(BANDS[key].rgb);
    showState("result");

    animateNumber(clamped);
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;
    resultAnnouncer.textContent = `Final mental health score: ${clamped.toFixed(2)} out of 10.`;

    // arc + needle: reset instantly, then animate to value
    gaugeFill.style.transition = "none";
    gaugeNeedle.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    gaugeNeedle.style.transform = "rotate(-90deg)";
    void gaugeFill.getBoundingClientRect();

    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      gaugeNeedle.style.transition = "";
      gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH * (1 - clamped / 10));
      gaugeNeedle.style.transform = `rotate(${-90 + (clamped / 10) * 180}deg)`;
    });

    setTimeout(() => burstFromGauge(BANDS[key].hex, clamped >= 8 ? 90 : 40), 900);
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  /* loading copy: cycles, and explains slow cold starts on free hosting */
  let loadingTimers = [];
  const LOADING_STEPS = [
    ["Reading the signal…", "Running your habits through the model."],
    ["Weighing sleep and screen time…", "Looking at how your day adds up."],
    ["Checking stress and activity…", "Almost there."],
  ];

  function startLoadingCopy() {
    stopLoadingCopy();
    loadingLabelEl.textContent = LOADING_STEPS[0][0];
    loadingCopyEl.textContent = LOADING_STEPS[0][1];
    [1, 2].forEach((i) => {
      loadingTimers.push(setTimeout(() => {
        loadingLabelEl.textContent = LOADING_STEPS[i][0];
        loadingCopyEl.textContent = LOADING_STEPS[i][1];
      }, i * 1800));
    });
    loadingTimers.push(setTimeout(() => {
      loadingLabelEl.textContent = "Waking up the server…";
      loadingCopyEl.textContent = "Free hosting sleeps when idle, so the first request can take up to a minute.";
    }, 7000));
  }

  function stopLoadingCopy() {
    loadingTimers.forEach(clearTimeout);
    loadingTimers = [];
  }

  /* =========================================================
     SUBMIT
     ========================================================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      updateFormProgress();
      const first = clientErrors[0][0];
      first?.scrollIntoView?.({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
      (first?.type === "hidden" ? segButtons[0] : first)?.focus?.({ preventScroll: true });
      return;
    }

    setSubmitting(true);
    showState("loading");
    startLoadingCopy();

    if (window.matchMedia("(max-width: 920px)").matches) {
      resultPanel.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
    }

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      stopLoadingCopy();

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
    } catch (err) {
      stopLoadingCopy();
      renderError(
        "Can't reach the server",
        `Couldn't connect to ${API_BASE}. Make sure the backend is running (uvicorn main:app --port 2200 --reload) and reachable from this page.`
      );
    } finally {
      stopLoadingCopy();
      setSubmitting(false);
    }
  });

  /* =========================================================
     INPUT LISTENERS, RESET, EXAMPLE
     ========================================================= */
  form.querySelectorAll("input:not(.slider), select").forEach((el) => {
    const onChange = () => {
      clearFieldError(el);
      updateFormProgress();
      updateDayMap();
      if (el.type === "number") syncSlidersFromInputs();
    };
    el.addEventListener("input", onChange);
    el.addEventListener("change", onChange);
  });

  function resetAll() {
    form.reset();
    resetStressSelection();
    clearAllErrors();
    syncSlidersFromInputs();
    updateFormProgress();
    updateDayMap();
    resultAnnouncer.textContent = "";
    scoreNumberEl.dataset.value = "0";
    setAccent("61, 220, 151");
    showState("idle");
  }

  resetBtn.addEventListener("click", resetAll);
  errorRetryBtn.addEventListener("click", resetAll);
  clearBtn.addEventListener("click", resetAll);

  const EXAMPLES = [
    { age: 21, gender: "Female", country: "India", academic_level: "Undergraduate", most_used_platform: "Instagram",
      purpose_of_use: "Entertainment", avg_daily_usage_hours: 5.5, daily_unlocks: 85, study_hours: 4,
      physical_activity_hours: 1, sleep_hours_per_night: 7, stress_level: "Medium" },
    { age: 19, gender: "Male", country: "USA", academic_level: "Undergraduate", most_used_platform: "TikTok",
      purpose_of_use: "Entertainment", avg_daily_usage_hours: 8.5, daily_unlocks: 140, study_hours: 2.5,
      physical_activity_hours: 0.2, sleep_hours_per_night: 5, stress_level: "High" },
    { age: 24, gender: "Female", country: "Germany", academic_level: "Graduate", most_used_platform: "LinkedIn",
      purpose_of_use: "Education", avg_daily_usage_hours: 2.5, daily_unlocks: 40, study_hours: 5,
      physical_activity_hours: 1.5, sleep_hours_per_night: 8, stress_level: "Low" },
  ];
  let exampleIdx = -1;

  exampleBtn.addEventListener("click", () => {
    exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
    const ex = EXAMPLES[exampleIdx];
    clearAllErrors();

    Object.entries(ex).forEach(([key, value], i) => {
      setTimeout(() => {
        if (key === "stress_level") {
          selectStress(value);
        } else {
          const el = document.getElementById(key);
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        updateFormProgress();
        updateDayMap();
        syncSlidersFromInputs();
      }, REDUCED_MOTION ? 0 : i * 55);
    });
  });

  /* ripple on buttons */
  document.querySelectorAll(".submit-btn, .reset-btn, .ghost-btn").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      if (REDUCED_MOTION) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const r = document.createElement("span");
      r.className = "ripple";
      r.style.width = r.style.height = `${size}px`;
      r.style.left = `${e.clientX - rect.left - size / 2}px`;
      r.style.top = `${e.clientY - rect.top - size / 2}px`;
      if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
      btn.style.overflow = "hidden";
      btn.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    });
  });

  /* =========================================================
     AMBIENT: cursor aurora + panel spotlight
     ========================================================= */
  const aurora = document.getElementById("aurora");
  let ax = window.innerWidth * 0.7, ay = window.innerHeight * 0.25, tx = ax, ty = ay;

  if (!REDUCED_MOTION) {
    window.addEventListener("pointermove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function followCursor() {
      ax += (tx - ax) * 0.07;
      ay += (ty - ay) * 0.07;
      aurora.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
      requestAnimationFrame(followCursor);
    })();
  } else {
    aurora.style.transform = `translate3d(${ax}px, ${ay}px, 0)`;
  }

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.addEventListener("pointermove", (e) => {
      const rect = panel.getBoundingClientRect();
      panel.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      panel.style.setProperty("--my", `${e.clientY - rect.top}px`);
    });
  });

  /* =========================================================
     AMBIENT: fireflies + result burst (single canvas)
     ========================================================= */
  const canvas = document.getElementById("fx-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  const flies = [];
  const sparks = [];
  const FLY_COLORS = ["255,200,87", "47,196,201", "61,220,151", "124,140,255"];

  function resizeCanvas() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function makeFly() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -Math.random() * 0.22 - 0.03,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.008,
      c: FLY_COLORS[(Math.random() * FLY_COLORS.length) | 0],
    };
  }

  function initFlies() {
    flies.length = 0;
    const count = Math.round(Math.min(70, Math.max(24, (W * H) / 26000)));
    for (let i = 0; i < count; i++) flies.push(makeFly());
  }

  function burstFromGauge(hex, count) {
    if (REDUCED_MOTION) return;
    const g = document.querySelector(".gauge-result");
    if (!g) return;
    const rect = g.getBoundingClientRect();
    const ox = rect.left + rect.width / 2;
    const oy = rect.top + rect.height * 0.8;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.1 + Math.random() * 0.8);
      const speed = 2 + Math.random() * 4.5;
      sparks.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.012 + Math.random() * 0.012,
        r: Math.random() * 2.2 + 1,
        color: hex,
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);

    for (const f of flies) {
      f.phase += f.speed;
      f.x += f.vx + Math.sin(f.phase) * 0.15;
      f.y += f.vy;
      if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
      if (f.x < -10) f.x = W + 10;
      if (f.x > W + 10) f.x = -10;
      const a = 0.25 + (Math.sin(f.phase * 2) + 1) * 0.28;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6);
      grad.addColorStop(0, `rgba(${f.c},${a})`);
      grad.addColorStop(1, `rgba(${f.c},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy;
      s.vy += 0.09; s.vx *= 0.985;
      s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(s.life, 0);
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    requestAnimationFrame(frame);
  }

  resizeCanvas();
  initFlies();
  if (!REDUCED_MOTION) requestAnimationFrame(frame);
  window.addEventListener("resize", () => { resizeCanvas(); initFlies(); });

  /* =========================================================
     INIT
     ========================================================= */
  syncSlidersFromInputs();
  updateFormProgress();
  updateDayMap();
})();
