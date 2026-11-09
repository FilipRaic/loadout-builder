// Feedback dialog: sends by email (through FormSubmit) or opens a pre-filled GitHub issue.
(function (L) {
  "use strict";

  const { $ } = L;

  // The site has no server, so the form is relayed to email by FormSubmit (formsubmit.co).
  // The first submission sends a one-time activation email; after activating, FormSubmit also
  // emails a random alias that can replace the address below so it isn't public.
  const FEEDBACK_ENDPOINT =
    "https://formsubmit.co/ajax/c1b44d8c0e8e8c7d5eb802ea9cf41123";
  const REPO = "https://github.com/FilipRaic/loadout-builder";

  const KINDS = {
    bug: { prefix: "Bug", label: "bug" },
    idea: { prefix: "Idea", label: "enhancement" },
    pattern: { prefix: "Pattern request", label: "pattern request" },
    other: { prefix: "Feedback", label: "" },
  };

  // what the form says and does for each "Send via" choice
  const VIA = {
    email: {
      note: "Sent straight to my inbox. No account needed.",
      button: "Send",
    },
    github: {
      note: "Opens a pre-filled public issue on GitHub. You need a GitHub account.",
      button: "Continue on GitHub",
    },
  };

  function openIssue(m) {
    const q = new URLSearchParams({ title: m.title, body: m.body });
    if (m.label) q.set("labels", m.label);
    window.open(`${REPO}/issues/new?${q}`, "_blank", "noopener");
  }

  async function sendEmail(f, m) {
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: `Loadout Builder: ${m.title}`,
        _template: "box",
        _honey: f._honey.value,
        email: f.email.value.trim() || undefined, // FormSubmit uses it as Reply-To
        type: f.kind.value,
        summary: f.title.value.trim(),
        message: m.body,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) !== "true")
      throw new Error(data.message || res.statusText);
  }

  L.initFeedback = function () {
    const dlg = $("#feedbackDlg");
    const form = $("#feedbackForm");
    const status = $("#fbStatus");
    const send = $("#fbSend");
    const via = () => form.elements.via.value;

    const setStatus = (text, error) => {
      status.textContent = text;
      status.classList.toggle("error", !!error);
    };

    const showVia = () => {
      const v = VIA[via()];
      setStatus(v.note);
      send.textContent = v.button;
      $("#fbEmailField").hidden = via() !== "email";
    };

    const open = (kind) => {
      form.reset();
      send.disabled = false;
      if (kind) form.elements.kind.value = kind;
      showVia();
      dlg.showModal();
      form.elements.title.focus();
    };

    // title, body and issue label built from the form
    const compose = () => {
      const f = form.elements;
      const k = KINDS[f.kind.value] || KINDS.other;
      const lines = [f.body.value.trim() || "(No details given)"];
      if (f.loadout.checked) lines.push("", `Loadout: ${L.shareUrl()}`);
      lines.push(
        "",
        "---",
        `Browser: ${navigator.userAgent}`,
        `Screen: ${innerWidth}×${innerHeight}`,
      );
      return {
        title: `${k.prefix}: ${f.title.value.trim()}`,
        body: lines.join("\n"),
        label: k.label,
      };
    };

    form.elements.via.forEach((r) => r.addEventListener("change", showVia));
    $("#feedback").onclick = () => open();
    $("#requestPattern").onclick = (e) => {
      e.preventDefault();
      open("pattern");
    };
    $("#fbCancel").onclick = () => dlg.close();

    form.onsubmit = async (e) => {
      e.preventDefault();
      const m = compose();
      if (via() === "github") {
        openIssue(m);
        dlg.close();
        L.toast("Thanks! Finish the issue on GitHub");
        return;
      }
      send.disabled = true;
      setStatus("Sending…");
      try {
        await sendEmail(form.elements, m);
        dlg.close();
        L.toast("Thanks! Feedback sent");
      } catch (err) {
        send.disabled = false;
        setStatus(
          `Couldn't send the email (${err.message || "network error"}). ` +
            "Please try again, or choose GitHub issue above.",
          true,
        );
      }
    };
  };
})((window.Loadout = window.Loadout || {}));
