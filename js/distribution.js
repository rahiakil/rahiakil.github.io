(async function () {
  const data = await loadJSON("data/vendors.json");
  const rubric = await loadJSON("data/rubric.json");
  const maxShare = rubric.fairness.maxShare;
  const maxConsec = rubric.fairness.maxConsecutiveMajor;

  const state = {
    assignments: data.assignments.map((a) => ({ ...a })),
  };

  const eventSelect = document.getElementById("eventFilter");
  const slotsEl = document.getElementById("slots");
  const shareEl = document.getElementById("shareBars");
  const alertsEl = document.getElementById("alerts");
  const rubricHitEl = document.getElementById("rubricHit");

  data.events.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = `${e.name} · ${e.scale} · ~${e.headcount}`;
    eventSelect.appendChild(opt);
  });

  function vendorById(id) {
    return data.vendors.find((v) => v.id === id);
  }

  function eventById(id) {
    return data.events.find((e) => e.id === id);
  }

  function majorAssignments() {
    return state.assignments.filter((a) => eventById(a.eventId)?.major);
  }

  function shareMap() {
    const majors = majorAssignments();
    const total = majors.length || 1;
    const map = {};
    data.vendors.forEach((v) => (map[v.id] = 0));
    majors.forEach((a) => {
      map[a.vendorId] = (map[a.vendorId] || 0) + 1;
    });
    Object.keys(map).forEach((id) => {
      map[id] = { count: map[id], share: map[id] / total, total };
    });
    return map;
  }

  function consecutiveRisk(vendorId) {
    const ordered = [...data.events]
      .filter((e) => e.major)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let run = 0;
    let maxRun = 0;
    ordered.forEach((e) => {
      const hit = state.assignments.some(
        (a) => a.eventId === e.id && a.vendorId === vendorId
      );
      run = hit ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    });
    return maxRun;
  }

  function renderShares() {
    const shares = shareMap();
    shareEl.innerHTML = "";
    const ranked = Object.entries(shares).sort((a, b) => b[1].share - a[1].share);
    ranked.forEach(([id, info]) => {
      if (info.count === 0) return;
      const v = vendorById(id);
      const pct = Math.round(info.share * 100);
      const row = document.createElement("div");
      const hot = info.share > maxShare;
      const warn = info.share > maxShare * 0.85;
      row.className = "vendor-bar" + (hot ? " hot" : warn ? " warn" : "");
      row.innerHTML = `
        <span title="${v.specialty}">${v.label}</span>
        <div class="bar-track"><div class="fill" style="width:${pct}%"></div></div>
        <strong>${pct}%</strong>`;
      shareEl.appendChild(row);
    });
  }

  function renderAlerts(focusEventId) {
    const shares = shareMap();
    const alerts = [];
    Object.entries(shares).forEach(([id, info]) => {
      if (info.share > maxShare) {
        alerts.push({
          level: "hot",
          text: `${vendorById(id).label} holds ${Math.round(info.share * 100)}% of major slots (cap ${Math.round(maxShare * 100)}%). Rotation score should drop.`,
        });
      }
      const run = consecutiveRisk(id);
      if (run > maxConsec) {
        alerts.push({
          level: "hot",
          text: `${vendorById(id).label} appears in ${run} consecutive major events (cap ${maxConsec}).`,
        });
      }
    });

    const ev = eventById(focusEventId);
    if (ev) {
      const band = rubric.scaleBands.find((b) => b.id === ev.scale);
      const assigned = state.assignments.filter((a) => a.eventId === ev.id);
      const unique = new Set(assigned.map((a) => a.vendorId)).size;
      if (band && unique < band.vendors && (ev.scale === "L" || ev.scale === "XL")) {
        alerts.push({
          level: "warn",
          text: `${ev.name} is ${ev.scale} (~${ev.headcount}). Guidance prefers ${band.vendors} vendors for menu variety and scale fit; you currently have ${unique}.`,
        });
      }
      if (unique >= 2 && (ev.scale === "L" || ev.scale === "XL")) {
        alerts.push({
          level: "ok",
          text: `${ev.name}: dual (or multi) vendor mix supports menu variety and scale fit.`,
        });
      }
    }

    if (!alerts.length) {
      alerts.push({ level: "ok", text: "Distribution looks balanced against the fairness caps." });
    }

    alertsEl.innerHTML = alerts
      .map(
        (a) =>
          `<div class="alert ${a.level === "ok" ? "ok" : ""}">${a.text}</div>`
      )
      .join("");

    // Rubric dimension highlight
    const dims = [];
    const focusShares = Object.values(shares).some((s) => s.share > maxShare);
    dims.push({
      id: "rotation",
      ok: !focusShares,
      note: focusShares
        ? "Concentration too high: awarding this slot weakens fairness."
        : "Share within cap: rotation criterion can score 4–5.",
    });
    if (ev) {
      const band = rubric.scaleBands.find((b) => b.id === ev.scale);
      const unique = new Set(
        state.assignments.filter((a) => a.eventId === ev.id).map((a) => a.vendorId)
      ).size;
      dims.push({
        id: "scale_fit",
        ok: !band || unique >= band.vendors || ev.scale === "S" || ev.scale === "M",
        note: `Scale ${ev.scale}: ${unique} vendor(s) assigned.`,
      });
      dims.push({
        id: "menu_variety",
        ok: unique >= 2 || ev.scale === "S",
        note:
          unique >= 2
            ? "Multiple vendors improve guest choice."
            : "Single vendor: ensure the menu itself is broad.",
      });
      dims.push({
        id: "pricing",
        ok: true,
        note: "Compare quotes in the scorecard; this simulator does not set price.",
      });
    }
    rubricHitEl.innerHTML = dims
      .map((d) => {
        const c = rubric.criteria.find((x) => x.id === d.id);
        return `<div class="gate"><span class="badge ${d.ok ? "ok" : "warn"}">${d.ok ? "OK" : "Watch"}</span><div><strong>${c.label}</strong> (weight ${c.weight})<br/><span class="muted small">${d.note}</span></div></div>`;
      })
      .join("");
  }

  function renderSlots() {
    const eventId = eventSelect.value;
    const ev = eventById(eventId);
    slotsEl.innerHTML = "";
    if (!ev) return;

    const scaleNote = document.createElement("p");
    scaleNote.className = "muted small";
    scaleNote.textContent = `Scale band ${ev.scale} · headcount ~${ev.headcount} · slots: ${ev.slots.join(", ")}`;
    slotsEl.appendChild(scaleNote);

    ev.slots.forEach((slot) => {
      const current = state.assignments.find(
        (a) => a.eventId === eventId && a.slot === slot
      );
      const card = document.createElement("div");
      card.className = "slot-card";
      const options = data.vendors
        .map(
          (v) =>
            `<option value="${v.id}" ${current && current.vendorId === v.id ? "selected" : ""}>${v.label} — ${v.specialty}</option>`
        )
        .join("");
      card.innerHTML = `
        <header>
          <strong>${slot.replaceAll("_", " ")}</strong>
          <span class="badge">${ev.scale}</span>
        </header>
        <label class="field" for="sel-${eventId}-${slot}">Assign vendor</label>
        <select id="sel-${eventId}-${slot}" data-event="${eventId}" data-slot="${slot}">
          <option value="">— unassigned —</option>
          ${options}
        </select>`;
      slotsEl.appendChild(card);
    });

    slotsEl.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const eventId = sel.dataset.event;
        const slot = sel.dataset.slot;
        const vendorId = sel.value;
        state.assignments = state.assignments.filter(
          (a) => !(a.eventId === eventId && a.slot === slot)
        );
        if (vendorId) {
          state.assignments.push({ eventId, slot, vendorId, score: null });
        }
        renderShares();
        renderAlerts(eventId);
      });
    });
  }

  document.getElementById("resetBtn").addEventListener("click", () => {
    state.assignments = data.assignments.map((a) => ({ ...a }));
    renderSlots();
    renderShares();
    renderAlerts(eventSelect.value);
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const shares = shareMap();
    const lines = [["vendor", "major_slots", "share_pct"].join(",")];
    Object.entries(shares).forEach(([id, info]) => {
      lines.push([vendorById(id).label, info.count, Math.round(info.share * 100)].join(","));
    });
    lines.push("");
    lines.push("event,slot,vendor");
    state.assignments.forEach((a) => {
      lines.push([eventById(a.eventId).name, a.slot, vendorById(a.vendorId).label].join(","));
    });
    downloadText("vendor-distribution.csv", lines.join("\n"), "text/csv");
  });

  eventSelect.addEventListener("change", () => {
    renderSlots();
    renderAlerts(eventSelect.value);
  });

  eventSelect.value = data.events[0].id;
  renderSlots();
  renderShares();
  renderAlerts(eventSelect.value);
})();
