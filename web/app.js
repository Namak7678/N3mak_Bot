"use strict";

const AX = {
  state: null,
  activeView: "dashboard",
  taskFilter: "all",
  runtimeFilter: "active",
  feedPaused: false,
  commanderKey: "",
  pendingDecision: null,
  installPrompt: null,
  nativeRuntime: false,
  vaultStatus: null,
  colors: {
    orion: { hex: "#42e8ca", rgb: "66,232,202" },
    athena: { hex: "#68c9f0", rgb: "104,201,240" },
    atlas: { hex: "#ffbc6b", rgb: "255,188,107" },
    forge: { hex: "#76a9ff", rgb: "118,169,255" },
    sentinel: { hex: "#73efb4", rgb: "115,239,180" },
    pulse: { hex: "#c58cff", rgb: "197,140,255" },
    nexus: { hex: "#50ddd8", rgb: "80,221,216" },
    meridian: { hex: "#75baff", rgb: "117,186,255" },
    nautilus: { hex: "#55d7a5", rgb: "85,215,165" },
    aegis: { hex: "#ff9875", rgb: "255,152,117" },
    nova: { hex: "#f194d4", rgb: "241,148,212" }
  },
  statusLabels: {
    active: "نشط",
    processing: "قيد المعالجة",
    idle: "خامل",
    queued: "في الانتظار",
    in_progress: "قيد التنفيذ",
    review: "قيد المراجعة",
    blocked: "محظورة",
    completed: "مكتملة",
    approval: "تنتظر الموافقة"
  },
  runtimeLabels: {
    ready: "جاهزة للتشغيل",
    running: "تعمل الآن",
    waiting_approval: "بانتظار سلطتك",
    completed: "اكتملت الدورة",
    blocked: "محظورة",
    rejected: "مرفوضة"
  },
  stageLabels: {
    plan: "التخطيط", execute: "التنفيذ المعزول", review: "المراجعة",
    security: "الأمن", approval: "الموافقة", release: "الإصدار", complete: "الإغلاق"
  },
  priorityLabels: { critical: "حرجة", high: "مرتفعة", medium: "متوسطة", low: "منخفضة" }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function initials(agent) {
  if (!agent) return "AX";
  return agent.name.slice(0, 2);
}

function agentById(id) {
  return AX.state?.agents.find(agent => agent.id === id);
}

function colorFor(id) {
  return AX.colors[id] || AX.colors.orion;
}

function readCommanderKey() {
  try { return sessionStorage.getItem("atlantisx.commanderKey") || ""; } catch (_) { return ""; }
}

function storeCommanderKey(value) {
  AX.commanderKey = value;
  try {
    if (value) sessionStorage.setItem("atlantisx.commanderKey", value);
    else sessionStorage.removeItem("atlantisx.commanderKey");
  } catch (_) { /* Session-only in-memory fallback remains available. */ }
}

function nativeInvoke(command, args = {}) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return Promise.reject(new Error("Native IPC is unavailable"));
  return invoke(command, args);
}

async function initializeNativeVault() {
  if (typeof window.__TAURI__?.core?.invoke !== "function") return;
  AX.nativeRuntime = true;
  document.body.classList.add("native-runtime");
  $("#vault-control").hidden = false;
  $(".system-live span").textContent = "الخزنة الأصلية";
  $(".system-live small").textContent = "NATIVE CORE";
  try {
    AX.vaultStatus = await nativeInvoke("vault_status");
    await renderNativeVault();
    if (!AX.vaultStatus.unlocked) setTimeout(openNativeVault, 120);
  } catch (error) {
    $("#vault-message").textContent = String(error);
    toast("تعذر تهيئة الخزنة الأصلية.", "error");
  }
}

async function renderNativeVault() {
  if (!AX.nativeRuntime || !AX.vaultStatus) return;
  const unlocked = AX.vaultStatus.unlocked;
  const control = $("#vault-control");
  const status = $("#vault-status-card");
  control.classList.toggle("unlocked", unlocked);
  status.classList.toggle("unlocked", unlocked);
  $("#vault-control-label").textContent = unlocked ? "الخزنة مفتوحة" : "الخزنة مقفلة";
  const initialized = Boolean(AX.vaultStatus.initialized);
  $("#vault-status-title").textContent = unlocked
    ? "الخزنة مفتوحة لهذه الجلسة"
    : initialized ? "الخزنة مقفلة" : "أنشئ خزنتك المحلية";
  $("#vault-status-copy").textContent = unlocked
    ? "SQLCipher نشط. يزول المفتاح من الذاكرة عند القفل أو إغلاق التطبيق."
    : initialized
      ? "أدخل عبارتك لفتح الأهداف المشفّرة الموجودة على هذا الجهاز."
      : "اختر عبارة قوية. ستُنشأ خزنة SQLCipher جديدة على هذا الجهاز فقط.";
  $("#vault-backend").textContent = `${AX.vaultStatus.backend || "sqlcipher"} · SCHEMA ${AX.vaultStatus.schema_version}`.toUpperCase();
  $("#vault-unlock-form").hidden = unlocked;
  $("#vault-open-actions").hidden = !unlocked;
  $("#vault-confirm-field").hidden = initialized || unlocked;
  $("#vault-passphrase-confirm").required = !initialized && !unlocked;
  $("#vault-passphrase").autocomplete = initialized ? "current-password" : "new-password";
  $("#vault-unlock-submit").textContent = initialized ? "فتح الخزنة المشفّرة" : "إنشاء الخزنة المشفّرة";
  if (unlocked) {
    try {
      const goals = await nativeInvoke("list_goals");
      $("#vault-goal-count").textContent = `${goals.length} أهداف مشفّرة`;
    } catch (error) {
      $("#vault-message").textContent = String(error);
    }
  }
}

function openNativeVault() {
  if (!AX.nativeRuntime) return;
  $("#vault-message").textContent = "";
  renderNativeVault();
  const dialog = $("#vault-dialog");
  if (!dialog.open) dialog.showModal();
  if (!AX.vaultStatus?.unlocked) setTimeout(() => $("#vault-passphrase").focus(), 80);
}

function closeNativeVault() {
  $("#vault-passphrase").value = "";
  $("#vault-passphrase-confirm").value = "";
  $("#vault-message").textContent = "";
  $("#vault-dialog").close();
}

async function unlockNativeVault(passphrase) {
  const submit = $("#vault-unlock-submit");
  submit.disabled = true;
  submit.textContent = "جارٍ اشتقاق مفتاح الخزنة…";
  $("#vault-message").textContent = "";
  try {
    AX.vaultStatus = await nativeInvoke("unlock_vault", { passphrase });
    $("#vault-passphrase").value = "";
    await renderNativeVault();
    toast("فُتحت خزنة SQLCipher لهذه الجلسة فقط.");
  } catch (error) {
    AX.vaultStatus = await nativeInvoke("vault_status").catch(() => ({
      unlocked: false,
      initialized: Boolean(AX.vaultStatus?.initialized),
      backend: "sqlcipher",
      schema_version: 1
    }));
    await renderNativeVault();
    $("#vault-message").textContent = String(error);
  } finally {
    $("#vault-passphrase").value = "";
    $("#vault-passphrase-confirm").value = "";
    passphrase = "";
    submit.disabled = false;
    submit.textContent = AX.vaultStatus?.initialized ? "فتح الخزنة المشفّرة" : "إنشاء الخزنة المشفّرة";
  }
}

async function lockNativeVault() {
  try {
    AX.vaultStatus = await nativeInvoke("lock_vault");
    await renderNativeVault();
    toast("قُفلت الخزنة وأُزيل مفتاحها من الذاكرة.");
  } catch (error) {
    toast(String(error), "error");
  }
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (AX.commanderKey) headers.Authorization = `Bearer ${AX.commanderKey}`;
  const response = await fetch(path, { ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch (_) { /* API error shown below. */ }
  if (!response.ok) {
    const error = new Error(payload.error || `تعذر الاتصال بالخدمة (${response.status})`);
    error.status = response.status;
    error.code = payload.code;
    if (response.status === 401) showAuthorityDialog(error.message);
    throw error;
  }
  return payload;
}

async function loadState() {
  AX.state = await api("/api/state");
  renderAll();
}

function renderAll() {
  renderHeader();
  renderMetrics();
  renderWorkstreams();
  renderDecisions();
  renderAgentStrip();
  renderFeed();
  renderTeam();
  renderTasks();
  renderRuntime();
  renderIntelligence();
  renderIntegrations();
  renderBrief();
}

function renderHeader() {
  const { project, agents, metrics } = AX.state;
  $("#health-score").textContent = project.health;
  $("#health-ring").style.setProperty("--health", project.health);
  $("#agents-count").textContent = agents.length;
  $("#tasks-count").textContent = metrics.in_progress;
  $("#runtime-count").textContent = AX.state.runtime.queue + AX.state.runtime.waiting_approval;
  $("#decision-count").textContent = AX.state.decisions.length;

  const authority = AX.state.runtime.authority || { mode: "local_single_user", verified: false };
  const authorityControl = $("#authority-control");
  authorityControl.classList.toggle("verified", authority.verified);
  $("#authority-label").textContent = authority.verified ? "VERIFIED CEO" : "LOCAL MODE";
  authorityControl.title = authority.verified ? "جلسة القائد محمية بمفتاح" : "تشغيل محلي دون تحقق هوية";

  const decisionCount = AX.state.decisions.length;
  $("#hero-status-copy").textContent = decisionCount
    ? `كل الوحدات متصلة. هناك ${decisionCount} من القرارات السيادية بانتظار سلطتك.`
    : "كل الوحدات متصلة. لا توجد قرارات سيادية معلّقة الآن.";

  const now = new Date();
  const date = new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(now);
  $("#current-date").textContent = date;
  $("#brief-date").textContent = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "full", timeStyle: "short"
  }).format(now);
}

function renderMetrics() {
  const metrics = AX.state.metrics;
  const availableAgents = AX.state.agents.filter(agent => agent.status !== "idle").length;
  const items = [
    { label: "مكتملة", value: metrics.completed, note: "السجل الأساسي + runtime", tone: "up", icon: "check" },
    { label: "قيد التنفيذ", value: metrics.in_progress, note: "وفق الحالة الحالية", tone: "", icon: "activity" },
    { label: "محظورة", value: metrics.blocked, note: "تشمل بوابات القرار", tone: "", icon: "lock" },
    { label: "حرجة", value: metrics.critical, note: "ضمن السجل الحالي", tone: "alert", icon: "bell" },
    { label: "موظفو AI", value: AX.state.agents.length, note: `${availableAgents} بحالة عمل داخلية`, tone: "up", icon: "users" }
  ];
  $("#metrics-grid").innerHTML = items.map(item => `
    <article class="metric-card">
      <div class="metric-icon">${icon(item.icon)}</div>
      <div class="metric-copy"><span>${item.label}</span><b>${item.value}</b><small class="${item.tone}">${item.note}</small></div>
    </article>`).join("");
}

function renderWorkstreams() {
  $("#workstreams").innerHTML = AX.state.workstreams.map(stream => `
    <div class="workstream-row ${stream.state}">
      <span class="workstream-label">${escapeHTML(stream.label)}</span>
      <div class="progress-track"><i data-width="${stream.value}"></i></div>
      <b>${stream.value}%</b><small>${escapeHTML(stream.delta)}</small>
    </div>`).join("");
  requestAnimationFrame(() => {
    $$("#workstreams [data-width]").forEach(bar => { bar.style.width = `${bar.dataset.width}%`; });
  });
}

function renderDecisions() {
  const list = $("#decisions-list");
  if (!AX.state.decisions.length) {
    list.innerHTML = `<div class="empty-state">لا توجد قرارات معلّقة الآن.</div>`;
    return;
  }
  list.innerHTML = AX.state.decisions.slice(0, 2).map(decision => `
    <div class="decision-item" data-decision-id="${escapeHTML(decision.id)}" data-task-id="${escapeHTML(decision.task_id)}">
      <div class="decision-meta"><span class="risk-tag">● مخاطرة ${escapeHTML(decision.risk)}</span><time>${escapeHTML(decision.time)}</time></div>
      <h3>${escapeHTML(decision.title)}</h3>
      <div class="decision-actions"><button class="approve" data-review-decision>مراجعة واتخاذ قرار</button><button class="inspect" data-open-runtime-task>فتح دورة المهمة</button></div>
    </div>`).join("");
}

function agentAvatar(agent, className = "") {
  const color = colorFor(agent.id);
  return `<div class="agent-avatar ${className}" style="--agent-color:${color.hex}">${initials(agent)}<i class="agent-status ${agent.status}"></i></div>`;
}

function renderAgentStrip() {
  $("#agent-strip").innerHTML = AX.state.agents.slice(0, 6).map(agent => `
    <button class="agent-mini" data-agent-id="${agent.id}">
      ${agentAvatar(agent)}<strong>${escapeHTML(agent.name)}</strong><small>${escapeHTML(agent.role_ar)}</small>
    </button>`).join("");
}

function renderFeed() {
  if (AX.feedPaused) return;
  $("#feed-list").innerHTML = AX.state.activities.slice(0, 6).map(activity => {
    const agent = agentById(activity.agent);
    return `<div class="feed-item">
      <div class="feed-agent">${initials(agent)}</div>
      <div class="feed-copy"><strong>${escapeHTML(agent?.name || activity.agent.toUpperCase())}</strong><p>${escapeHTML(activity.text)}</p></div>
      <time>${escapeHTML(activity.time)}</time>
    </div>`;
  }).join("");
}

function renderTeam() {
  const active = AX.state.agents.filter(agent => agent.status === "active").length;
  const processing = AX.state.agents.filter(agent => agent.status === "processing").length;
  const avgPerformance = Math.round(AX.state.agents.reduce((sum, agent) => sum + agent.performance, 0) / AX.state.agents.length);
  $("#team-summary").innerHTML = [
    ["إجمالي الموظفين", AX.state.agents.length, ""],
    ["نشط الآن", active, "aqua"],
    ["قيد المعالجة", processing, "amber"],
    ["متوسط الأداء", `${avgPerformance}%`, "aqua"]
  ].map(([label, value, tone]) => `<div class="team-summary-item"><span>${label}</span><strong class="${tone}">${value}</strong></div>`).join("");
  filterAgents();
}

function filterAgents() {
  if (!AX.state) return;
  const query = ($("#agent-search")?.value || "").trim().toLocaleLowerCase("ar");
  const agents = AX.state.agents.filter(agent => [agent.name, agent.role_ar, agent.division, agent.mission]
    .some(value => value.toLocaleLowerCase("ar").includes(query)));
  $("#agent-grid").innerHTML = agents.length ? agents.map(agentCard).join("") : `<div class="empty-state">لا يوجد موظف مطابق للبحث.</div>`;
}

function agentCard(agent) {
  const color = colorFor(agent.id);
  return `<article class="agent-card" tabindex="0" role="button" data-agent-id="${agent.id}" style="--agent-rgb:${color.rgb};--agent-color:${color.hex}">
    <div class="agent-card-head">
      ${agentAvatar(agent)}
      <div class="agent-identity"><strong>${escapeHTML(agent.name)}</strong><span>${escapeHTML(agent.role_ar)}</span></div>
      <div class="agent-performance"><b>${agent.performance}</b><small>PERFORMANCE</small></div>
    </div>
    <div class="agent-card-task"><span>المهمة الحالية</span><p>${escapeHTML(agent.current_task)}</p></div>
    <div class="agent-card-footer">
      <div><div class="workload-label"><span class="status-chip ${agent.status}"><i></i>${AX.statusLabels[agent.status]}</span><b>${agent.workload}% حمل</b></div><div class="workload-track"><i style="width:${agent.workload}%"></i></div></div>
      <button aria-label="فتح التفاصيل">${icon("chevron")}</button>
    </div>
  </article>`;
}

function renderTasks() {
  if (!AX.state) return;
  const query = ($("#task-search")?.value || "").trim().toLocaleLowerCase("ar");
  let tasks = AX.state.tasks;
  if (AX.taskFilter !== "all") {
    tasks = tasks.filter(task => AX.taskFilter === "blocked" ? ["blocked", "approval"].includes(task.status) : task.status === AX.taskFilter);
  }
  if (query) tasks = tasks.filter(task => `${task.id} ${task.title} ${task.type}`.toLocaleLowerCase("ar").includes(query));
  $("#task-list").innerHTML = tasks.length ? tasks.map(taskRow).join("") : `<div class="empty-state">لا توجد مهام مطابقة لهذا العرض.</div>`;
}

function taskRow(task) {
  const owner = agentById(task.owner);
  const options = ["queued", "in_progress", "review", "blocked", "completed", "approval"]
    .map(status => `<option value="${status}" ${task.status === status ? "selected" : ""}>${AX.statusLabels[status]}</option>`).join("");
  return `<div class="task-row" data-task-id="${task.id}">
    <div class="task-title"><i class="task-priority-line ${task.priority}"></i><div><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.id)} · ${escapeHTML(task.type)}</small></div></div>
    <div class="task-owner"><i>${initials(owner)}</i><span>${escapeHTML(owner?.name || task.owner)}</span></div>
    <select class="task-status-select" aria-label="حالة ${task.id}">${options}</select>
    <span class="priority-chip ${task.priority}">${AX.priorityLabels[task.priority] || task.priority}</span>
    <div class="task-progress"><div class="progress-track"><i style="width:${task.progress}%"></i></div><span>${task.progress}%</span></div>
    <span class="task-due">${escapeHTML(task.due)}</span>
  </div>`;
}

function renderRuntime() {
  if (!AX.state?.runtime) return;
  const runtime = AX.state.runtime;
  const summaries = [
    { label: "في صف التنفيذ", value: runtime.queue, tone: "aqua", note: "READY / RUNNING" },
    { label: "تنتظر سلطتك", value: runtime.waiting_approval, tone: "amber", note: "SOVEREIGN GATE" },
    { label: "دورات مكتملة", value: runtime.completed_cycles, tone: "violet", note: "AUDITED" },
    { label: "محظورة أو مرفوضة", value: runtime.blocked, tone: "red", note: "CONTAINED" }
  ];
  $("#runtime-summary").innerHTML = summaries.map(item => `
    <article class="runtime-stat panel ${item.tone}"><div><span>${item.label}</span><small>${item.note}</small></div><b>${item.value}</b></article>`).join("");

  const filter = AX.runtimeFilter;
  let tasks = [...AX.state.tasks];
  if (filter === "active") tasks = tasks.filter(task => ["ready", "running", "waiting_approval"].includes(task.workflow.state));
  else if (filter !== "all") tasks = tasks.filter(task => task.workflow.state === filter);
  const rank = { waiting_approval: 0, running: 1, ready: 2, blocked: 3, rejected: 4, completed: 5 };
  tasks.sort((a, b) => (rank[a.workflow.state] ?? 9) - (rank[b.workflow.state] ?? 9));
  $("#runtime-queue").innerHTML = tasks.length ? tasks.map(runtimeTaskCard).join("") : `
    <div class="runtime-empty"><span>${icon("check")}</span><strong>لا توجد دورات في هذا العرض</strong><p>غيّر المرشح أو أرسل توجيهًا جديدًا إلى Orion.</p></div>`;

  const audit = runtime.audit_events || [];
  $("#audit-count").textContent = `${audit.length} EVENTS`;
  $("#runtime-audit").innerHTML = audit.length ? audit.slice(0, 12).map(event => {
    const agent = agentById(event.agent);
    const time = event.created_at ? new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.created_at)) : "الآن";
    return `<div class="audit-event ${event.outcome}"><i></i><div><span>${escapeHTML(event.task_id)} · ${escapeHTML(AX.stageLabels[event.stage] || event.stage)}</span><p>${escapeHTML(event.message)}</p><small>${escapeHTML(agent?.name || event.agent)} · ${time}</small></div></div>`;
  }).join("") : `<div class="runtime-empty compact"><span>${icon("activity")}</span><strong>السجل جاهز</strong><p>ستظهر هنا كل مرحلة يتم تشغيلها.</p></div>`;
}

function runtimeTaskCard(task) {
  const workflow = task.workflow;
  const currentStage = workflow.stages.find(stage => ["ready", "running", "waiting"].includes(stage.status)) || workflow.stages.at(-1);
  const currentOwner = agentById(currentStage.owner);
  const doneCount = workflow.stages.filter(stage => ["done", "skipped"].includes(stage.status)).length;
  const stageTrack = workflow.stages.map(stage => `
    <div class="runtime-node ${stage.status}" title="${escapeHTML(stage.label_ar)}"><i>${stage.status === "done" ? icon("check") : ""}</i><span>${escapeHTML(stage.label)}</span></div>`).join(`<b class="runtime-node-link"></b>`);
  let actions = "";
  if (["ready", "running"].includes(workflow.state)) {
    actions = `<button class="runtime-action secondary" data-runtime-run="next" data-task-id="${task.id}">مرحلة واحدة</button><button class="runtime-action primary" data-runtime-run="until_gate" data-task-id="${task.id}">${workflow.policy.requires_approval ? "تشغيل حتى بوابة القرار" : "إكمال الدورة محليًا"}</button>`;
  } else if (workflow.state === "waiting_approval") {
    actions = `<button class="runtime-action reject" data-runtime-decision="reject" data-task-id="${task.id}">رفض وإيقاف</button><button class="runtime-action approve" data-runtime-decision="approve" data-task-id="${task.id}">${icon("lock")} اعتماد واستكمال</button>`;
  } else if (workflow.state === "completed") {
    actions = `<span class="runtime-finished">${icon("check")} دورة مكتملة ومسجّلة</span>`;
  } else {
    actions = `<span class="runtime-contained">${icon("shield")} متوقفة ضمن حدود السياسة</span>`;
  }
  return `<article class="runtime-task" data-workflow-state="${workflow.state}" data-runtime-task-id="${task.id}">
    <div class="runtime-task-head">
      <div class="runtime-task-title"><span>${escapeHTML(task.id)} · ${escapeHTML(task.type)}</span><h3>${escapeHTML(task.title)}</h3></div>
      <span class="runtime-state ${workflow.state}"><i></i>${escapeHTML(AX.runtimeLabels[workflow.state] || workflow.state)}</span>
    </div>
    <div class="runtime-task-meta"><div>${agentAvatar(currentOwner || agentById(task.owner), "tiny")}<p><span>المسؤول عن المرحلة</span><strong>${escapeHTML(currentOwner?.name || currentStage.owner)} · ${escapeHTML(currentStage.label_ar)}</strong></p></div><div class="runtime-policy"><span>${workflow.policy.requires_approval ? icon("lock") + " موافقة سيادية مطلوبة" : icon("shield") + " مسار محلي آمن"}</span><small>${doneCount}/${workflow.stages.length} مراحل</small></div></div>
    <div class="runtime-stage-track">${stageTrack}</div>
    <div class="runtime-task-footer"><span class="runtime-scope"><i></i>${escapeHTML(workflow.policy.execution_scope)} · NO EXTERNAL EFFECTS</span><div>${actions}</div></div>
  </article>`;
}

async function runRuntimeTask(taskId, mode = "until_gate") {
  const buttons = $$(`[data-task-id="${taskId}"][data-runtime-run]`);
  buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await api(`/api/tasks/${taskId}/run`, { method: "POST", body: JSON.stringify({ mode }) });
    await loadState();
    if (result.workflow.state === "waiting_approval") toast(`${taskId} وصل إلى بوابة سلطتك وينتظر القرار.`);
    else if (result.workflow.state === "completed") toast(`${taskId} أكمل الدورة المحلية وسُجلت كل المراحل.`);
    else toast(`${taskId}: اكتملت مرحلة ${AX.stageLabels[result.executed.at(-1)] || "التشغيل"}.`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function openSovereignDecision(taskId, decision) {
  const task = AX.state.tasks.find(item => item.id === taskId);
  if (!task || task.workflow.state !== "waiting_approval") {
    toast("هذه المهمة ليست عند بوابة الموافقة الآن.", "error");
    return;
  }
  AX.pendingDecision = { taskId, decision };
  const rejecting = decision === "reject";
  const dialog = $("#sovereign-dialog");
  dialog.classList.toggle("reject", rejecting);
  $("#sovereign-kicker").textContent = rejecting ? "CONTAIN & REJECT" : "SOVEREIGN APPROVAL";
  $("#sovereign-title").textContent = rejecting ? "رفض الدورة واحتواؤها" : "اعتماد الاستمرار ضمن النطاق";
  $("#sovereign-description").textContent = rejecting
    ? "سيوقف هذا القرار مرحلة الإصدار ويحوّل المهمة إلى محظورة. لن يحدث أي أثر خارجي."
    : "سيُسجل اعتمادك في سجل التدقيق، ثم تستكمل الدورة إصدارًا محليًا مضبوطًا فقط.";
  $("#sovereign-task-id").textContent = `${task.id} · ${task.type}`;
  $("#sovereign-task-name").textContent = task.title;
  $("#sovereign-note").value = "";
  $("#sovereign-confirm").checked = false;
  $("#sovereign-confirm-copy").textContent = rejecting
    ? "راجعت المهمة وأؤكد رفض الإصدار واحتواء الدورة."
    : "راجعت النطاق وأعتمد الاستمرار بإصدار محلي فقط.";
  $("#sovereign-submit").textContent = rejecting ? "تأكيد الرفض والاحتواء" : "تسجيل الاعتماد والاستكمال";
  dialog.showModal();
}

function closeSovereignDecision() {
  const dialog = $("#sovereign-dialog");
  if (dialog.open) dialog.close();
  AX.pendingDecision = null;
}

async function decideRuntimeTask(taskId, decision, note = "") {
  const submit = $("#sovereign-submit");
  submit.disabled = true;
  try {
    await api(`/api/tasks/${taskId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, note })
    });
    if (decision === "approve") {
      await api(`/api/tasks/${taskId}/run`, { method: "POST", body: JSON.stringify({ mode: "until_gate" }) });
    }
    await loadState();
    closeSovereignDecision();
    toast(decision === "approve" ? `${taskId}: سُجل قرارك واكتمل الإصدار المحلي.` : `${taskId}: سُجل الرفض واحتُويت الدورة.`);
  } catch (error) {
    toast(error.message, "error");
    if (error.status !== 401) await loadState();
  } finally {
    submit.disabled = false;
  }
}

function renderIntelligence() {
  $("#intel-signals").innerHTML = AX.state.intelligence.map(signal => `
    <article class="intel-signal">
      <div class="signal-head"><span class="signal-country"><i>${signal.flag}</i>${escapeHTML(signal.country)}</span><span class="signal-tag">${escapeHTML(signal.signal)} · ${escapeHTML(signal.sector)}</span></div>
      <h3>${escapeHTML(signal.title)}</h3>
      <div class="confidence"><span>ثقة التحليل</span><div class="progress-track"><i style="width:${signal.confidence}%"></i></div><b>${signal.confidence}%</b></div>
    </article>`).join("");
}

function renderIntegrations() {
  $("#integration-grid").innerHTML = AX.state.integrations.map(integration => `
    <article class="integration-card">
      <div class="integration-head"><div class="integration-logo">${integration.name.slice(0, 2).toUpperCase()}</div><span class="integration-state ${integration.status}"><i></i>${integration.status === "local" ? "متاح محليًا" : "بانتظار الربط"}</span></div>
      <h2>${escapeHTML(integration.name)}</h2><span class="integration-purpose">${escapeHTML(integration.purpose)}</span>
      <p class="integration-detail">${escapeHTML(integration.detail)}</p>
      <button data-integration="${integration.id}" ${integration.status === "local" ? "disabled" : ""}>${integration.status === "local" ? "المستودع متاح" : "عرض متطلبات الربط"}</button>
    </article>`).join("");
}

function renderBrief() {
  if (!AX.state) return;
  const urgent = AX.state.tasks.filter(task => task.priority === "critical" && task.status !== "completed");
  const activeAgents = AX.state.agents.filter(agent => agent.status !== "idle").length;
  $("#brief-content").innerHTML = `
    <div class="brief-summary">
      <div><b>${AX.state.project.health}</b><span>صحة المشروع</span></div><div><b>${activeAgents}/${AX.state.agents.length}</b><span>وحدات عاملة</span></div><div><b>${AX.state.metrics.in_progress}</b><span>قيد التنفيذ</span></div><div><b>${AX.state.decisions.length}</b><span>قرار مطلوب</span></div>
    </div>
    <section class="brief-block"><h3>ما تغيّر منذ آخر موجز</h3><ul>${AX.state.activities.slice(0, 3).map(item => `<li>${escapeHTML(item.text)} — ${escapeHTML(item.time)}</li>`).join("")}</ul></section>
    <section class="brief-block"><h3>الأولوية التنفيذية</h3><ul>${urgent.length ? urgent.map(task => `<li><b>${task.id}</b> · ${escapeHTML(task.title)} — ${escapeHTML(task.progress)}%</li>`).join("") : "<li>لا توجد مهام حرجة مفتوحة.</li>"}</ul></section>
    <section class="brief-block decision"><h3>قرار القائد</h3><ul>${AX.state.decisions.slice(0, 1).map(decision => `<li>${escapeHTML(decision.title)} · طلب ${escapeHTML(decision.requested_by)}</li>`).join("") || "<li>لا يوجد قرار مطلوب حاليًا.</li>"}</ul></section>
    <section class="brief-block"><h3>ملاحظة تشغيلية</h3><ul><li>GitHub متاح كمستودع محلي فقط. Notion وAirtable وPostHog غير متصلة حتى يتم توفير إعدادات الربط الآمنة والتحقق منها.</li></ul></section>`;
}

function setView(view) {
  const target = $(`[data-view-section="${view}"]`);
  if (!target) return;
  AX.activeView = view;
  $$("[data-view-section]").forEach(section => section.classList.toggle("active", section === target));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const currentNav = $(`.nav-item[data-view="${view}"] span`);
  $("#page-title").textContent = currentNav?.textContent || "مركز القيادة";
  history.replaceState(null, "", view === "dashboard" ? location.pathname : `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  closeSidebar();
}

function openAgent(agentId) {
  const agent = agentById(agentId);
  if (!agent) return;
  const color = colorFor(agent.id);
  $("#drawer-content").innerHTML = `
    <div class="drawer-profile" style="--agent-color:${color.hex}">
      ${agentAvatar(agent)}<h2>${escapeHTML(agent.name)}</h2><p>${escapeHTML(agent.role)} · ${escapeHTML(agent.role_ar)}</p><span class="status-chip ${agent.status}"><i></i>${AX.statusLabels[agent.status]}</span>
    </div>
    <section class="drawer-section"><span>MISSION / المهمة</span><p>${escapeHTML(agent.mission)}</p><div class="drawer-current"><small>المهمة الحالية</small><strong>${escapeHTML(agent.current_task)}</strong></div></section>
    <section class="drawer-section"><span>SKILLS / المهارات</span><div class="tool-chips">${agent.skills.map(skill => `<i>${escapeHTML(skill)}</i>`).join("")}</div></section>
    <section class="drawer-section"><span>TOOLS / الأدوات</span><div class="tool-chips">${agent.tools.map(tool => `<i>${escapeHTML(tool)}</i>`).join("")}</div></section>
    <section class="drawer-section"><span>MEMORY CONTRACT / عقد الذاكرة</span><p>${escapeHTML(agent.memory.scope)}</p><div class="contract-note"><b>${escapeHTML(agent.memory.backend)}</b><span>${escapeHTML(agent.memory.write_policy)}</span></div></section>
    <section class="drawer-section"><span>LIVE QUEUE / صف العمل</span><div class="queue-counters"><div><b>${escapeHTML(agent.queue.depth)}</b><span>إجمالي</span></div><div><b>${escapeHTML(agent.queue.active)}</b><span>نشط</span></div><div><b>${escapeHTML(agent.queue.waiting_on_commander)}</b><span>ينتظر القائد</span></div><div><b>${escapeHTML(agent.queue.max_active)}</b><span>حد النشاط</span></div></div><p class="queue-strategy">${escapeHTML(agent.queue.strategy)}</p>${agent.queue.items.length ? `<ul class="agent-queue">${agent.queue.items.map(item => `<li><b>${escapeHTML(item.id)}</b><span>${escapeHTML(item.title)}</span><i>${escapeHTML(AX.statusLabels[item.status] || item.status)}</i></li>`).join("")}</ul>` : `<div class="drawer-empty">لا توجد عناصر معلّقة.</div>`}</section>
    <section class="drawer-section"><span>PERMISSIONS / حدود الصلاحية</span><ul class="permissions">${agent.permissions.map(permission => `<li>${escapeHTML(permission)}</li>`).join("")}</ul></section>
    <section class="drawer-section"><span>COMMUNICATION / التواصل</span><div class="tool-chips">${agent.communication.channels.map(channel => `<i>${escapeHTML(channel)}</i>`).join("")}</div><p class="contract-cadence">${escapeHTML(agent.communication.cadence)}</p></section>
    <section class="drawer-section"><span>ESCALATION / التصعيد</span><ul class="permissions">${agent.escalation.triggers.map(trigger => `<li>${escapeHTML(trigger)}</li>`).join("")}</ul><div class="escalation-path">${agent.escalation.path.map(step => `<i>${escapeHTML(step)}</i>`).join(icon("arrow"))}</div></section>
    <section class="drawer-section"><span>LIVE KPIs</span><div class="drawer-kpis">${agent.kpis.map(kpi => `<div><b>${escapeHTML(kpi.value)}</b><span>${escapeHTML(kpi.label)}</span></div>`).join("")}</div></section>
    <section class="drawer-section"><span>REPORTING LINE</span><div class="reporting-line"><div><span>يرفع تقاريره إلى</span>${escapeHTML(agent.reports_to)}</div>${icon("arrow")}</div></section>`;
  $("#agent-drawer").classList.add("open");
  $("#agent-drawer").setAttribute("aria-hidden", "false");
  $("#drawer-overlay").classList.add("open");
}

function closeAgent() {
  $("#agent-drawer").classList.remove("open");
  $("#agent-drawer").setAttribute("aria-hidden", "true");
  $("#drawer-overlay").classList.remove("open");
}

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-overlay").classList.remove("open");
}

function showAuthorityDialog(message = "") {
  storeCommanderKey("");
  const dialog = $("#authority-dialog");
  $("#authority-message").textContent = message;
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $("#authority-key").focus(), 80);
}

async function authorizeCommander(key) {
  const submit = $("#authority-submit");
  submit.disabled = true;
  submit.textContent = "جارٍ التحقق…";
  $("#authority-message").textContent = "";
  storeCommanderKey(key);
  try {
    await loadState();
    $("#authority-dialog").close();
    $("#authority-key").value = "";
    toast("تم التحقق من جلسة القائد.");
  } catch (error) {
    storeCommanderKey("");
    $("#authority-message").textContent = error.status === 401 ? "المفتاح غير صحيح. تحقق من قيمة متغير البيئة." : error.message;
    $("#authority-key").select();
  } finally {
    submit.disabled = false;
    submit.textContent = "فتح مركز القيادة";
  }
}

function handleAuthorityControl() {
  const authority = AX.state?.runtime?.authority;
  if (authority?.mode === "commander_key") {
    showAuthorityDialog("تم قفل الجلسة محليًا. أدخل مفتاح القائد لإعادة فتحها.");
    return;
  }
  toast("الجلسة تعمل محليًا دون تحقق. اضبط ATLANTISX_COMMANDER_KEY لتفعيل الحماية.");
}

async function submitCommand(command) {
  command = command.trim();
  if (!command) {
    toast("اكتب توجيهًا واضحًا أولًا.", "error");
    return;
  }
  const submit = $("#command-form .send-command");
  submit.disabled = true;
  submit.querySelector("span").textContent = "Orion يحلّل…";
  try {
    if (AX.nativeRuntime) {
      if (!AX.vaultStatus?.unlocked) {
        openNativeVault();
        throw new Error("افتح الخزنة المشفّرة أولًا لحفظ الهدف الأصلي.");
      }
      const goal = await nativeInvoke("create_goal", { title: command });
      $("#command-input").value = "";
      autoGrow($("#command-input"));
      await renderNativeVault();
      toast(`حُفظ الهدف ${goal.id.slice(0, 8)} داخل خزنة SQLCipher.`);
      return;
    }
    const result = await api("/api/commands", { method: "POST", body: JSON.stringify({ command }) });
    await loadState();
    showCommandResult(result);
    $("#command-input").value = "";
    autoGrow($("#command-input"));
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "إرسال التوجيه";
  }
}

function showCommandResult(result) {
  const approval = result.requires_approval;
  $("#command-result").innerHTML = `
    <div class="dialog-result-icon ${approval ? "approval" : ""}">${icon(approval ? "lock" : "check")}</div>
    <div class="command-result-head"><span class="section-kicker ${approval ? "amber" : ""}">${approval ? "SOVEREIGN APPROVAL GATE" : "LOCAL CYCLE COMPLETE"}</span><h2>${approval ? "توقفت الدورة عند بوابة سلطتك" : "أكمل الفريق التوجيه محليًا"}</h2><p>${escapeHTML(result.message)}</p></div>
    <div class="command-ticket"><span>${escapeHTML(result.task.title)}</span><b>${escapeHTML(result.task.id)} · ORION → ${escapeHTML(result.executor_name)}</b></div>
    <div class="command-plan">${result.plan.map((step, index) => `<div><i>0${index + 1}</i><span>${escapeHTML(step)}</span></div>`).join("")}</div>
    <button class="dialog-action" data-go-view="runtime" data-close-dialog>${approval ? "فتح بوابة القرار" : "عرض سجل الدورة المكتملة"}</button>`;
  $("#command-dialog").showModal();
}

async function updateTaskStatus(select) {
  const row = select.closest(".task-row");
  const taskId = row.dataset.taskId;
  select.disabled = true;
  try {
    await api(`/api/tasks/${taskId}/status`, { method: "POST", body: JSON.stringify({ status: select.value }) });
    await loadState();
    toast(`تم تحديث ${taskId} وتسجيل الحدث.`);
  } catch (error) {
    toast(error.message, "error");
    await loadState();
  } finally {
    select.disabled = false;
  }
}

function showBrief() {
  renderBrief();
  $("#brief-dialog").showModal();
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.innerHTML = `<i></i><span>${escapeHTML(message)}</span>`;
  $("#toast-region").append(element);
  setTimeout(() => element.classList.add("out"), 3300);
  setTimeout(() => element.remove(), 3650);
}

function currentPlatform() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return { id: "ios", label: "iPhone / iPad", browser: "Safari" };
  if (/Android/i.test(ua)) return { id: "android", label: "Android", browser: "Chrome" };
  if (/Windows/i.test(ua)) return { id: "windows", label: "Windows", browser: "Edge أو Chrome" };
  if (/Mac/i.test(ua)) return { id: "macos", label: "macOS", browser: "Safari أو Chrome" };
  if (/Linux/i.test(ua)) return { id: "linux", label: "Linux", browser: "Chrome أو Chromium" };
  return { id: "web", label: "هذا الجهاز", browser: "متصفح حديث" };
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function renderInstallState() {
  const platform = currentPlatform();
  const installed = isStandaloneApp();
  $("#install-platform").textContent = `${platform.label} · ${platform.browser}`;
  $$("[data-platform-card]").forEach(card => card.classList.toggle("active", card.dataset.platformCard === platform.id));
  const primary = $("#install-primary");
  const help = $("#install-help");
  $("#install-ready-dot").classList.toggle("ready", installed || Boolean(AX.installPrompt));

  if (installed) {
    primary.disabled = true;
    primary.querySelector("span").textContent = "Atlantis-X مثبت على هذا الجهاز";
    help.textContent = "افتح التطبيق لاحقًا من الشاشة الرئيسية أو قائمة Start.";
  } else if (AX.installPrompt) {
    primary.disabled = false;
    primary.querySelector("span").textContent = `تثبيت على ${platform.label}`;
    help.textContent = "سيطلب المتصفح تأكيدًا واحدًا ثم يضيف التطبيق والأيقونة تلقائيًا.";
  } else if (platform.id === "ios") {
    primary.disabled = false;
    primary.querySelector("span").textContent = "عرض خطوات iPhone / iPad";
    help.textContent = "في Safari اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية»، ثم «إضافة».";
  } else {
    primary.disabled = false;
    primary.querySelector("span").textContent = "عرض طريقة التثبيت";
    help.textContent = "افتح قائمة المتصفح واختر «تثبيت Atlantis-X» أو «إضافة إلى الشاشة الرئيسية».";
  }
}

function openInstallDialog() {
  renderInstallState();
  const dialog = $("#install-dialog");
  if (!dialog.open) dialog.showModal();
}

async function installApplication() {
  const platform = currentPlatform();
  if (isStandaloneApp()) return;
  if (!AX.installPrompt) {
    renderInstallState();
    toast(platform.id === "ios"
      ? "Safari: مشاركة ← إضافة إلى الشاشة الرئيسية ← إضافة."
      : "من قائمة المتصفح اختر تثبيت Atlantis-X أو إضافة إلى الشاشة الرئيسية.");
    return;
  }
  AX.installPrompt.prompt();
  const choice = await AX.installPrompt.userChoice;
  if (choice.outcome === "accepted") {
    toast("تم قبول تثبيت Atlantis-X على جهازك.");
    AX.installPrompt = null;
  }
  renderInstallState();
}

function setupInstallExperience() {
  if (AX.nativeRuntime) return;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    AX.installPrompt = event;
    $("#install-app")?.classList.add("ready");
    renderInstallState();
  });
  window.addEventListener("appinstalled", () => {
    AX.installPrompt = null;
    $("#install-app")?.classList.add("installed");
    renderInstallState();
    toast("اكتمل تثبيت Atlantis-X. يمكنك فتحه من أيقونة الجهاز.");
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(error => {
      console.warn("Atlantis-X service worker registration failed", error);
    });
  }
  if (isStandaloneApp()) $("#install-app")?.classList.add("installed");
}

function autoGrow(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 72)}px`;
}

function bindEvents() {
  document.addEventListener("click", event => {
    const nav = event.target.closest(".nav-item");
    if (nav) setView(nav.dataset.view);

    const viewButton = event.target.closest("[data-go-view]");
    if (viewButton) setView(viewButton.dataset.goView);

    const agentTarget = event.target.closest("[data-agent-id]");
    if (agentTarget) openAgent(agentTarget.dataset.agentId);

    const suggestion = event.target.closest("[data-command]");
    if (suggestion) {
      const input = $("#command-input");
      input.value = suggestion.dataset.command;
      autoGrow(input);
      input.focus();
    }

    const runtimeRun = event.target.closest("[data-runtime-run]");
    if (runtimeRun) runRuntimeTask(runtimeRun.dataset.taskId, runtimeRun.dataset.runtimeRun);

    const runtimeDecision = event.target.closest("[data-runtime-decision]");
    if (runtimeDecision) openSovereignDecision(runtimeDecision.dataset.taskId, runtimeDecision.dataset.runtimeDecision);

    if (event.target.closest("[data-close-sovereign]")) closeSovereignDecision();
    if (event.target.closest("[data-close-install]")) $("#install-dialog")?.close();
    if (event.target.closest("[data-close-vault]")) closeNativeVault();
    if (event.target.closest("[data-close-dialog]")) event.target.closest("dialog")?.close();

    const integration = event.target.closest("[data-integration]");
    if (integration) toast("الربط يحتاج Adapter وبيانات اعتماد آمنة خارج المستودع — لم يتم تفعيله.");

    const mapPoint = event.target.closest("[data-country]");
    if (mapPoint) toast(`تم تحديد ${mapPoint.dataset.country} في نطاق المتابعة الاستخبارية.`);

    const reviewDecision = event.target.closest("[data-review-decision]");
    if (reviewDecision) {
      const decisionItem = reviewDecision.closest("[data-task-id]");
      openSovereignDecision(decisionItem.dataset.taskId, "approve");
    }

    const openRuntimeTask = event.target.closest("[data-open-runtime-task]");
    if (openRuntimeTask) {
      const decisionItem = openRuntimeTask.closest("[data-task-id]");
      AX.runtimeFilter = "all";
      $("#runtime-filter").value = "all";
      setView("runtime");
      renderRuntime();
      setTimeout(() => {
        const card = $(`[data-runtime-task-id="${decisionItem.dataset.taskId}"]`);
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.classList.add("attention");
        setTimeout(() => card?.classList.remove("attention"), 1800);
      }, 120);
    }
  });

  document.addEventListener("keydown", event => {
    const card = event.target.closest?.(".agent-card");
    if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openAgent(card.dataset.agentId); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); focusCommand(); }
    if (event.key === "Escape") { closeAgent(); closeSidebar(); }
  });

  $("#command-form").addEventListener("submit", event => { event.preventDefault(); submitCommand($("#command-input").value); });
  $("#authority-form").addEventListener("submit", event => {
    event.preventDefault();
    authorizeCommander($("#authority-key").value.trim());
  });
  $("#vault-unlock-form").addEventListener("submit", event => {
    event.preventDefault();
    const passphrase = $("#vault-passphrase").value;
    if (!AX.vaultStatus?.initialized && passphrase !== $("#vault-passphrase-confirm").value) {
      $("#vault-message").textContent = "عبارتا المرور غير متطابقتين. لم تُنشأ الخزنة.";
      $("#vault-passphrase-confirm").focus();
      return;
    }
    unlockNativeVault(passphrase);
  });
  $("#sovereign-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!AX.pendingDecision) return;
    decideRuntimeTask(AX.pendingDecision.taskId, AX.pendingDecision.decision, $("#sovereign-note").value.trim());
  });
  $("#command-input").addEventListener("input", event => autoGrow(event.target));
  $("#agent-search").addEventListener("input", filterAgents);
  $("#task-search").addEventListener("input", renderTasks);
  $("#task-list").addEventListener("change", event => { if (event.target.matches(".task-status-select")) updateTaskStatus(event.target); });
  $("#task-tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-task-filter]");
    if (!button) return;
    AX.taskFilter = button.dataset.taskFilter;
    $$("#task-tabs button").forEach(item => item.classList.toggle("active", item === button));
    renderTasks();
  });
  $("#runtime-filter").addEventListener("change", event => {
    AX.runtimeFilter = event.target.value;
    renderRuntime();
  });
  $("#runtime-run-first").addEventListener("click", () => {
    const task = AX.state.tasks.find(item => ["ready", "running"].includes(item.workflow.state) && !item.workflow.policy.requires_approval);
    if (!task) return toast("لا توجد دورة آمنة جاهزة للتشغيل الآن.", "error");
    runRuntimeTask(task.id, "until_gate");
  });
  $("#feed-pause").addEventListener("click", event => {
    AX.feedPaused = !AX.feedPaused;
    event.currentTarget.classList.toggle("paused", AX.feedPaused);
    toast(AX.feedPaused ? "تم تجميد عرض التغذية." : "تم استئناف عرض التغذية.");
    if (!AX.feedPaused) renderFeed();
  });
  $("#brief-button").addEventListener("click", showBrief);
  $("#install-app").addEventListener("click", openInstallDialog);
  $("#install-primary").addEventListener("click", installApplication);
  $("#vault-control").addEventListener("click", openNativeVault);
  $("#vault-lock-button").addEventListener("click", lockNativeVault);
  $("#org-chart-button").addEventListener("click", () => $("#org-dialog").showModal());
  $("#global-search").addEventListener("click", focusCommand);
  $("#authority-control").addEventListener("click", handleAuthorityControl);
  $("#new-command-button").addEventListener("click", focusCommand);
  $("#drawer-close").addEventListener("click", closeAgent);
  $("#drawer-overlay").addEventListener("click", closeAgent);
  $("#mobile-menu").addEventListener("click", () => { $("#sidebar").classList.add("open"); $("#sidebar-overlay").classList.add("open"); });
  $("#sidebar-overlay").addEventListener("click", closeSidebar);
  $("#authority-dialog").addEventListener("cancel", event => event.preventDefault());
  $("#sovereign-dialog").addEventListener("cancel", event => {
    event.preventDefault();
    closeSovereignDecision();
  });
  $("#vault-dialog").addEventListener("cancel", event => {
    event.preventDefault();
    closeNativeVault();
  });
  $$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
    if (event.target !== dialog || dialog.id === "authority-dialog") return;
    if (dialog.id === "sovereign-dialog") closeSovereignDecision();
    else if (dialog.id === "vault-dialog") closeNativeVault();
    else dialog.close();
  }));
}

function focusCommand() {
  setView("dashboard");
  setTimeout(() => { $("#command-input").focus(); $("#command-input").scrollIntoView({ behavior: "smooth", block: "center" }); }, 120);
}

async function init() {
  bindEvents();
  await initializeNativeVault();
  setupInstallExperience();
  storeCommanderKey(readCommanderKey());
  const initialHash = location.hash.replace("#", "");
  try {
    await loadState();
    if (initialHash) setView(initialHash);
  } catch (error) {
    console.error(error);
    if (error.status !== 401) toast(AX.nativeRuntime
      ? "الخزنة الأصلية جاهزة، لكن محرك الفريق الكامل لم يُحمّل في هذه الحزمة."
      : "تعذر تحميل Knowledge Core المحلي. شغّل server.py ثم أعد المحاولة.", "error");
  } finally {
    setTimeout(() => document.body.classList.add("ready"), 350);
  }
}

init();
