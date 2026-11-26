// PulseRetain marketing site: ROI calculator and demo-request form.
(function () {
  "use strict";

  // Same public Lambda Function URL the app uses; submit_lead needs no login.
  var LEAD_URL = "https://duu25rkvvopryctqwaxzleqxg40nbcqf.lambda-url.us-east-1.on.aws/";

  var $ = function (id) { return document.getElementById(id); };
  var money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  function fmtMembers(n) {
    var r = Math.round(n * 10) / 10;
    var s = r % 1 === 0 ? String(r) : r.toFixed(1);
    return s + (r === 1 ? " member" : " members");
  }

  // ── ROI calculator ─────────────────────────────────────────────────────────
  var form = $("roi-form");
  var lastResult = null;

  function renderRoi() {
    var r = window.PulseROI.calculate({
      members: form.elements.members.value,
      dues: form.elements.dues.value,
      churnPct: form.elements.churnPct.value,
      savePct: form.elements.savePct.value,
    });
    lastResult = r;
    var churn = Number(form.elements.churnPct.value);
    var save = Number(form.elements.savePct.value);
    $("roi-churn-out").textContent = churn + "%";
    $("roi-save-out").textContent = save + "%";

    $("roi-lost-monthly").innerHTML = money.format(r.lostMonthly) + "<span>/month</span>";
    $("roi-lost-detail").textContent =
      "About " + fmtMembers(r.lostMembers) + " cancel each month, and their dues stop with them. " +
      "That one month of cancellations is " + money.format(r.lostYearly) + " a year in dues.";

    document.querySelector(".roi-save .roi-label").textContent = "Keep " + save + "% of them and you hold on to";
    $("roi-saved-monthly").innerHTML = money.format(r.savedMonthly) + "<span>/month</span>";

    var plan = $("roi-plan-detail");
    if (!r.plan) {
      plan.textContent = "For more than 5,000 members we'll quote a custom plan.";
    } else if (r.breakEvenMembers == null) {
      plan.textContent = "The " + r.plan.name + " plan is " + money.format(r.planCost) + "/month.";
    } else {
      var keep = r.breakEvenMembers === 1 ? "1 member" : r.breakEvenMembers + " members";
      plan.textContent = "The " + r.plan.name + " plan is " + money.format(r.planCost) +
        "/month. Keeping " + keep + " a month covers it.";
    }

    // Highlight the plan that fits this roster in the pricing section.
    var plans = document.querySelectorAll(".plan");
    for (var i = 0; i < plans.length; i++) {
      plans[i].classList.toggle("is-match", !!r.plan && plans[i].getAttribute("data-plan") === r.plan.id);
    }
  }
  form.addEventListener("input", renderRoi);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  renderRoi();

  // Pre-fill the demo form from the calculator and plan buttons.
  function sizeBucket(n) {
    if (n < 100) return "Under 100";
    if (n <= 300) return "100 to 300";
    if (n <= 1000) return "300 to 1,000";
    if (n <= 5000) return "1,000 to 5,000";
    return "More than 5,000";
  }
  $("roi-cta").addEventListener("click", function () {
    if (!lastResult) return;
    if (lastResult.members > 0) $("d-size").value = sizeBucket(lastResult.members);
    $("d-plan").value = lastResult.plan ? lastResult.plan.name : "Custom";
  });
  var picks = document.querySelectorAll("[data-pick]");
  for (var p = 0; p < picks.length; p++) {
    picks[p].addEventListener("click", function (e) { $("d-plan").value = e.currentTarget.getAttribute("data-pick"); });
  }

  // ── Demo request ───────────────────────────────────────────────────────────
  var demo = $("demo-form");
  var errBox = $("demo-error");
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function showError(msg) { errBox.textContent = msg; errBox.hidden = !msg; }

  demo.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    var fields = { name: demo.elements.name, email: demo.elements.email, gym: demo.elements.gym, size: demo.elements.size };
    var missing = [];
    Object.keys(fields).forEach(function (k) {
      var el = fields[k];
      var bad = !el.value.trim() || (k === "email" && !EMAIL.test(el.value.trim()));
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad) missing.push(el);
    });
    if (missing.length) {
      showError(missing.length === 1 && missing[0] === demo.elements.email && demo.elements.email.value.trim()
        ? "Please check your email address."
        : "Please fill in the highlighted fields.");
      missing[0].focus();
      return;
    }
    // Spam trap filled in: pretend it worked, send nothing.
    if (demo.elements.website.value) { done(); return; }

    var planNote = demo.elements.plan.value ? "Demo request: " + demo.elements.plan.value : "Demo request";
    if (lastResult && lastResult.lostMonthly > 0) {
      planNote += " (calculator: " + money.format(lastResult.lostMonthly) + "/mo lost, " + lastResult.members + " members)";
    }

    var btn = $("demo-submit");
    btn.disabled = true;
    btn.textContent = "Sending...";
    fetch(LEAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_lead",
        lead: {
          name: demo.elements.name.value.trim(),
          email: demo.elements.email.value.trim(),
          gym: demo.elements.gym.value.trim(),
          size: demo.elements.size.value,
          plan: planNote,
        },
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        done();
      })
      .catch(function () {
        showError("That didn't go through. Please try again in a minute.");
        btn.disabled = false;
        btn.textContent = "Request a demo";
      });
  });

  function done() {
    demo.hidden = true;
    var box = $("demo-done");
    box.hidden = false;
    box.focus();
  }

  var y = $("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
