(async function () {
  const data = await loadJSON("data/vendors.json");
  const rubric = await loadJSON("data/rubric.json");

  const mealEl = document.getElementById("reqMeal");
  const scaleEl = document.getElementById("reqScale");
  const headEl = document.getElementById("reqHeadcount");
  const budgetEl = document.getElementById("reqBudget");
  const dualEl = document.getElementById("reqDual");
  const kidsEl = document.getElementById("reqKids");
  const reliabilityEl = document.getElementById("reqReliability");
  const rotationEl = document.getElementById("reqRotation");
  const eventEl = document.getElementById("reqEvent");
  const notesEl = document.getElementById("reqNotes");
  const resultsEl = document.getElementById("results");
  const matrixEl = document.getElementById("matrix");
  const reasonEl = document.getElementById("reasoning");

  data.mealTypes.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.label;
    mealEl.appendChild(o);
  });
  ["S", "M", "L", "XL"].forEach((s) => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    scaleEl.appendChild(o);
  });
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Custom / not listed";
  eventEl.appendChild(opt0);
  data.events.forEach((e) => {
    const o = document.createElement("option");
    o.value = e.id;
    o.textContent = `${e.name} (${e.date}) · ${e.scale}`;
    eventEl.appendChild(o);
  });

  function mealFitKey(meal) {
    if (meal === "snacks") return "snacks_fit";
    if (meal === "lunch") return "lunch_fit";
    if (meal === "dinner") return "dinner_fit";
    if (meal === "evening_stall") return "dinner_fit";
    if (meal === "sweets") return "sweets_fit";
    return "lunch_fit";
  }

  function scoreVendor(v, req) {
    const fitKey = mealFitKey(req.meal);
    const preferred = (v.preferredMeals || []).includes(req.meal);
    let total = 0;
    const parts = [];

    const fit = v.scores[fitKey] || 1;
    const fitW = 28;
    total += (fit / 5) * fitW;
    parts.push({ label: "Meal-type fit", w: fitW, raw: fit, note: `${fitKey}=${fit}${preferred ? " (preferred lane)" : ""}` });

    const priceW = 18;
    let price = v.scores.price;
    if (req.budgetMax && req.budgetMax > 0 && req.meal === "lunch" && req.budgetMax <= 15) {
      // hard band like 2026 lunch cap
      if (v.id === "V_india_belly") price = 1;
      if (v.id === "V_mayuri") price = 5;
    }
    total += (price / 5) * priceW;
    parts.push({ label: "Price band", w: priceW, raw: price, note: req.budgetMax ? `budget cue $${req.budgetMax}` : "no hard budget" });

    const relW = req.reliabilityCritical ? 20 : 12;
    let rel = v.scores.reliability;
    if (req.reliabilityCritical && rel <= 2) rel = 1;
    total += (rel / 5) * relW;
    parts.push({ label: "Reliability", w: relW, raw: rel, note: req.reliabilityCritical ? "critical for this event" : "standard" });

    const qualW = 12;
    total += (v.scores.quality / 5) * qualW;
    parts.push({ label: "Quality", w: qualW, raw: v.scores.quality, note: "" });

    const scaleW = 10;
    let scaleScore = v.scores.scale;
    if ((req.scale === "XL" || req.scale === "L") && scaleScore < 3) scaleScore = 2;
    if (req.scale === "S" && v.scores.scale >= 5) scaleScore = 4; // XL specialists slightly less ideal for tiny events
    total += (scaleScore / 5) * scaleW;
    parts.push({ label: "Scale", w: scaleW, raw: scaleScore, note: `event ${req.scale} ~${req.headcount}` });

    const rotW = req.prioritizeRotation ? 12 : 6;
    let rot = v.scores.rotation_need;
    // live adjustment from 2026 major load
    if (v.majorSlots2026 >= 4) rot = Math.min(rot, 1);
    else if (v.majorSlots2026 >= 2) rot = Math.min(rot, 3);
    total += (rot / 5) * rotW;
    parts.push({ label: "Rotation credit", w: rotW, raw: rot, note: `${v.majorSlots2026} major slots in 2026 baseline` });

    const flexW = 4;
    let flex = v.scores.flexibility;
    if (req.kids) flex = Math.min(5, flex + 1);
    total += (flex / 5) * flexW;
    parts.push({ label: "Flexibility", w: flexW, raw: flex, note: req.kids ? "kids option requested" : "" });

    // Penalties
    const gates = [];
    if (req.meal === "lunch" && req.budgetMax && req.budgetMax <= 15 && price <= 1) {
      total *= 0.55;
      gates.push("Likely fails price gate for volunteer lunch band.");
    }
    if (req.reliabilityCritical && v.scores.reliability <= 2) {
      total *= 0.7;
      gates.push("Reliability watch flag (late delivery history under this partner).");
    }
    if (!preferred && fit <= 2) {
      total *= 0.85;
      gates.push("Not in preferred meal lane for this partner.");
    }

    return { total: Math.round(total * 10) / 10, parts, gates, preferred };
  }

  function renderMatrix() {
    const dims = data.dimensions;
    let html = `<table><thead><tr><th>Vendor</th>${dims.map((d) => `<th title="${d.desc}">${d.label}</th>`).join("")}<th>2026 majors</th></tr></thead><tbody>`;
    data.vendors.forEach((v) => {
      html += `<tr><td><strong>${v.label}</strong><div class="muted small">${v.specialty}</div></td>`;
      dims.forEach((d) => {
        const s = v.scores[d.id] || 0;
        const pct = (s / 5) * 100;
        html += `<td><div class="bar-track" title="${s}/5"><div class="bar-fill" style="width:${pct}%"></div></div><span class="small">${s}</span></td>`;
      });
      html += `<td>${v.majorSlots2026}</td></tr>`;
    });
    html += "</tbody></table>";
    matrixEl.innerHTML = html;
  }

  function recommend() {
    const req = {
      meal: mealEl.value,
      scale: scaleEl.value,
      headcount: Number(headEl.value) || 0,
      budgetMax: Number(budgetEl.value) || 0,
      dual: dualEl.checked,
      kids: kidsEl.checked,
      reliabilityCritical: reliabilityEl.checked,
      prioritizeRotation: rotationEl.checked,
      eventId: eventEl.value,
      notes: (notesEl.value || "").trim(),
    };

    if (req.eventId) {
      const ev = data.events.find((e) => e.id === req.eventId);
      if (ev) {
        if (!headEl.value) req.headcount = ev.headcount;
        req.scale = ev.scale;
        scaleEl.value = ev.scale;
        if (!headEl.value) headEl.value = ev.headcount;
      }
    }

    const ranked = data.vendors
      .map((v) => ({ v, ...scoreVendor(v, req) }))
      .sort((a, b) => b.total - a.total);

    const top = ranked[0];
    const second = ranked[1];
    const mealLabel = data.mealTypes.find((m) => m.id === req.meal)?.label || req.meal;

    resultsEl.innerHTML = ranked
      .map((r, i) => {
        const badge =
          i === 0 ? '<span class="badge ok">Recommend</span>' : i === 1 && req.dual ? '<span class="badge">Alt / dual</span>' : `<span class="badge">${i + 1}</span>`;
        return `<div class="slot-card">
          <header>${badge}<strong>${r.v.label}</strong><span class="total-score" style="font-size:1.4rem">${r.total}</span></header>
          <p class="muted small">${r.v.specialty} · ${r.v.source}${r.v.aka?.length ? " · also: " + r.v.aka.join(", ") : ""}</p>
          <p class="small">${r.v.notes}</p>
          ${r.gates.length ? `<div class="alert">${r.gates.join(" ")}</div>` : ""}
          <div class="muted small">${r.parts.map((p) => `${p.label} ${p.raw}/5 (w${p.w})`).join(" · ")}</div>
        </div>`;
      })
      .join("");

    // Reasoning narrative
    const lines = [];
    lines.push(`For <strong>${mealLabel}</strong> at scale <strong>${req.scale}</strong>${req.headcount ? ` (~${req.headcount} guests)` : ""}${req.budgetMax ? `, budget cue <strong>$${req.budgetMax}</strong>` : ""}, the matrix ranks <strong>${top.v.label}</strong> first (score ${top.total}).`);
    lines.push(`Why: meal-fit ${top.parts[0].raw}/5, price ${top.parts[1].raw}/5, reliability ${top.parts[2].raw}/5, with ${top.v.majorSlots2026} major 2026 slots already (rotation credit ${top.parts.find((p) => p.label === "Rotation credit").raw}/5).`);
    if (top.v.source.includes("committee") && top.v.evidence.includes("thin")) {
      lines.push(`Note: <strong>${top.v.label}</strong> is committee-supplied with thin chat evidence. Treat this as a trial recommendation and capture a post-event score.`);
    }
    if (top.gates.length) {
      lines.push(`Caution on the top pick: ${top.gates.join(" ")}`);
    }
    if (req.dual && second) {
      lines.push(`Dual-vendor mode: pair with <strong>${second.v.label}</strong> (score ${second.total}) for menu variety and fairness, matching the 2026 Anjan Dutta / Kali pattern.`);
    }
    if (req.prioritizeRotation) {
      const underused = ranked.filter((r) => r.v.majorSlots2026 === 0).slice(0, 3);
      if (underused.length) {
        lines.push(`Rotation priority lifts unused partners: ${underused.map((u) => u.v.label).join(", ")}.`);
      }
      if (top.v.majorSlots2026 >= 4) {
        lines.push(`Even if volume capacity is high, <strong>${top.v.label}</strong> is heavy on 2026 majors. Prefer them for a lane they uniquely cover, or give the next order to a lighter partner.`);
      }
    }
    if (req.meal === "snacks") {
      lines.push(`Snacks lane preference order from the matrix: ${ranked
        .filter((r) => r.v.scores.snacks_fit >= 4)
        .map((r) => r.v.label)
        .join(" → ") || "tune snacks_fit scores"}.`);
    }
    if (req.meal === "lunch" || req.meal === "dinner") {
      lines.push(`${mealLabel} lane leaders: ${ranked
        .filter((r) => (req.meal === "lunch" ? r.v.scores.lunch_fit : r.v.scores.dinner_fit) >= 4)
        .map((r) => r.v.label)
        .join(" → ") || "none above 4"}`);
    }
    if (req.notes) {
      lines.push(`Leader notes considered in narrative only: “${req.notes.slice(0, 160)}”`);
    }
    lines.push(`Open committee questions (pricing ceiling, buffer policy, auto sit-out after late delivery) remain parked and do not override this ranking until you decide them.`);

    reasonEl.innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
  }

  document.getElementById("runBtn").addEventListener("click", recommend);
  document.getElementById("resetReq").addEventListener("click", () => {
    mealEl.value = "snacks";
    scaleEl.value = "M";
    headEl.value = "";
    budgetEl.value = "";
    dualEl.checked = false;
    kidsEl.checked = false;
    reliabilityEl.checked = true;
    rotationEl.checked = true;
    eventEl.value = "";
    notesEl.value = "";
    resultsEl.innerHTML = "";
    reasonEl.innerHTML = "<p class=\"muted\">Fill requirements and click Recommend.</p>";
  });

  renderMatrix();
  mealEl.value = "snacks";
  scaleEl.value = "M";
  reliabilityEl.checked = true;
  rotationEl.checked = true;
})();
