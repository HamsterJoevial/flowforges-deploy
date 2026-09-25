(() => {
  const VISITOR_KEY = "avantoffre_precheck_visitor";
  const VISITOR_HEADER = "x-avantoffre-precheck-visitor";
  const SUGGEST_URL = "https://data.geopf.fr/geocodage/search";

  const form = document.getElementById("avantoffre-precheck");
  const input = document.getElementById("precheck-address");
  const suggestions = document.getElementById("precheck-suggestions");
  const result = document.getElementById("precheck-result");
  const submit = document.getElementById("precheck-submit");

  if (!form || !input || !suggestions || !result || !submit) return;

  const apiUrl = () => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3017/api/public-precheck";
    }
    return "https://avantoffre.flowforges.fr/api/public-precheck";
  };

  const visitorId = () => {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  };

  const track = (name) => {
    if (window.umami && typeof window.umami.track === "function") {
      window.umami.track(name);
    }
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const linkItem = (href, label) => {
    if (!href) return "";
    return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`;
  };

  const renderResult = (precheck) => {
    const zoning = precheck.zoning?.label
      ? `${escapeHtml(precheck.zoning.label)}${precheck.zoning.labelLong ? ` — ${escapeHtml(precheck.zoning.labelLong)}` : ""}`
      : "Zonage GPU non retourné pour cette parcelle.";
    const parcelNote = precheck.parcel?.ambiguous
      ? "<p>Plusieurs parcelles sont possibles. Confirmez la référence dans le cadastre.</p>"
      : "";

    result.hidden = false;
    result.innerHTML = `
      <p class="precheck-kicker">Repérage seulement</p>
      <p class="precheck-address-row">
        <strong>${escapeHtml(precheck.address)}</strong>
        <button type="button" class="precheck-copy" data-copy="${escapeHtml(precheck.address)}">Copier l’adresse</button>
      </p>
      <dl>
        <div><dt>Commune</dt><dd>${escapeHtml(precheck.commune || "Non retournée")}${precheck.postalCode ? ` (${escapeHtml(precheck.postalCode)})` : ""}</dd></div>
        <div><dt>Parcelle</dt><dd>${escapeHtml(precheck.parcel?.label || "Non retournée")}</dd></div>
        <div><dt>Zonage GPU</dt><dd>${zoning}</dd></div>
      </dl>
      ${parcelNote}
      <p class="precheck-limit">C’est tout ce que cette page montre. Règlement, résumés, PDF et état des sources : dans l’app.</p>
      <ul class="precheck-links">
        ${linkItem(precheck.links?.cadastre, "Cadastre")}
        ${linkItem(precheck.links?.geoportail, "Géoportail")}
        ${linkItem(precheck.links?.gpu, "Géoportail de l’urbanisme")}
        ${linkItem(precheck.links?.georisques, "Géorisques")}
      </ul>
      ${(precheck.limits || []).map((line) => `<p class="precheck-limit">${escapeHtml(line)}</p>`).join("")}
      <a class="btn btn-primary" data-umami-event="avantoffre_precheck_cta" href="https://avantoffre.flowforges.fr/account?next=/">Ouvrir le dossier dans l’app</a>
    `;

    result.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(value);
          button.textContent = "Adresse copiée";
        } catch (_error) {
          button.textContent = "Sélectionnez l’adresse ci-dessus";
        }
      });
    });
  };

  const renderError = (message) => {
    result.hidden = false;
    result.innerHTML = `<p class="precheck-error">${escapeHtml(message)}</p>
      <a class="btn btn-secondary" data-umami-event="avantoffre_precheck_cta" href="https://avantoffre.flowforges.fr/account?next=/">Ouvrir le dossier dans l’app</a>`;
  };

  let suggestTimer = 0;
  let suggestController = null;

  const hideSuggestions = () => {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
  };

  const loadSuggestions = async (query) => {
    if (query.trim().length < 3) {
      hideSuggestions();
      return;
    }
    suggestController?.abort();
    suggestController = new AbortController();
    const url = `${SUGGEST_URL}?${new URLSearchParams({
      q: query,
      limit: "6",
      type: "housenumber",
      autocomplete: "1",
    })}`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: suggestController.signal,
    });
    if (!response.ok) return;
    const payload = await response.json();
    const labels = (payload.features || [])
      .map((feature) => feature?.properties?.label)
      .filter(Boolean);
    if (!labels.length) {
      hideSuggestions();
      return;
    }
    suggestions.innerHTML = labels.map((label) => (
      `<li><button type="button" data-address="${escapeHtml(label)}">${escapeHtml(label)}</button></li>`
    )).join("");
    suggestions.hidden = false;
  };

  input.addEventListener("input", () => {
    window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(() => {
      loadSuggestions(input.value).catch(() => hideSuggestions());
    }, 220);
  });

  suggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-address]");
    if (!button) return;
    input.value = button.getAttribute("data-address") || "";
    hideSuggestions();
    input.focus();
  });

  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) hideSuggestions();
  });

  result.addEventListener("click", (event) => {
    if (event.target.closest("[data-umami-event='avantoffre_precheck_cta']")) {
      track("avantoffre_precheck_cta");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSuggestions();
    const address = input.value.trim();
    if (address.length < 5) {
      renderError("Adresse trop courte pour un repérage.");
      return;
    }

    submit.disabled = true;
    result.hidden = false;
    result.innerHTML = "<p>Recherche de la parcelle et du zonage…</p>";
    track("avantoffre_precheck_submit");

    try {
      const response = await fetch(apiUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [VISITOR_HEADER]: visitorId(),
        },
        body: JSON.stringify({ address }),
      });
      const payload = await response.json().catch(() => ({}));
      const returnedVisitor = response.headers.get(VISITOR_HEADER);
      if (returnedVisitor) window.localStorage.setItem(VISITOR_KEY, returnedVisitor);

      if (response.status === 429) {
        track("avantoffre_precheck_limited");
        renderError(payload.error || "Repérage limité à 2 adresses aujourd’hui. Ouvrez un compte AvantOffre pour le dossier.");
        return;
      }
      if (!response.ok) {
        track("avantoffre_precheck_empty");
        renderError(payload.error || "Sources introuvables pour cette adresse.");
        return;
      }
      if (!payload.precheck?.parcel?.id && !payload.precheck?.zoning?.label) {
        track("avantoffre_precheck_empty");
      } else {
        track("avantoffre_precheck_success");
      }
      renderResult(payload.precheck);
    } catch {
      track("avantoffre_precheck_empty");
      renderError("Le repérage est indisponible pour le moment. Réessayez plus tard ou ouvrez un compte AvantOffre.");
    } finally {
      submit.disabled = false;
    }
  });
})();
