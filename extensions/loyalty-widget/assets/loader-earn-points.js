async function loadEarnPointsData() {
  try {
    // Check if customer is logged in via the root data attribute set by Liquid
    const root = document.getElementById("loyalty-spa-root");
    const customerId = root ? root.dataset.customerId : null;
    const isLoggedIn = !!customerId;

    // Default: newsletter not subscribed until API confirms
    let isSubscribed = false;

    if (isLoggedIn) {
      try {
        const response = await fetch("/apps/loyalty/customer");
        const data = await response.json();
        if (data.success && data.customer) {
          isSubscribed = data.customer.emailMarketingConsent === "subscribed";
        }
      } catch (e) {
        console.warn("Could not fetch customer data for earn-points:", e);
      }
    }

    const tasks = [
      {
        task: "1€ dépensé = 1 point",
        reward: 1,
        isCompleted: false,
        isActive: true,
        imgUrl:
          "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763561990/busket-icon-task_ghqwbs.svg",
        link: "/",
        textButton: "Je passe commande",
      },
      {
        task: "Créez vous un compte client",
        reward: 15,
        isCompleted: isLoggedIn,
        isActive: true,
        imgUrl:
          "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568092/user-icon-task_qryf1s.svg",
        link: "/account/register",
        textButton: "Je me crée un compte",
      },
      {
        task: "Inscription à la newsletter",
        reward: 100,
        isCompleted: isSubscribed,
        isActive: true,
        imgUrl:
          "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568125/newaletter-icon-task_zyw8cl.svg",
        link: "/",
        textButton: "Je m'abonne",
      },
    ];

    renderEarnPointsTasks(tasks);
    return { tasks };
  } catch (err) {
    console.error("Error loading earn points data:", err);
  }
}

function renderEarnPointsTasks(tasks) {
  const container = document.getElementById("earn-points-tasks");

  if (!container) {
    console.error("earn-points-tasks container not found");
    return;
  }

  const tasksHTML = tasks
    .map((task) => {
      const isNewsletter = task.task === "Inscription à la newsletter";
      const action = isNewsletter
        ? `<button class="task-button" onclick="openNewsletterModal()">${task.textButton}</button>`
        : `<a href="${task.link}" class="task-button">${task.textButton}</a>`;

      return `
        <div class="task-card-earn-points ${task.isCompleted ? "fidelity-completed" : ""}" data-task-id="${task.task}">
          <img
            src="${task.imgUrl}"
            alt="logo"
            class="earn-points-task-icon"
            width="33"
            height="33"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"
          >
          <div class="task-card-earn-points-text">
            <p>${task.reward + " points"}</p>
            <p>${task.task}</p>
          </div>
          ${action}
        </div>
      `;
    })
    .join("");

  container.innerHTML = tasksHTML;

  // Inject the newsletter modal once into the DOM (idempotent)
  if (!document.getElementById("newsletter-modal")) {
    const modal = document.createElement("div");
    modal.id = "newsletter-modal";
    modal.className = "newsletter-modal-overlay";
    modal.innerHTML = `
      <div class="newsletter-modal-box">
        <button class="newsletter-modal-close" onclick="closeNewsletterModal()" aria-label="Fermer">&times;</button>
        <div class="newsletter-modal-icon">✉️</div>
        <h3 class="newsletter-modal-title">Inscrivez-vous à la newsletter</h3>
        <p class="newsletter-modal-subtitle">Recevez nos offres et gagnez <strong>100 points</strong> de fidélité !</p>
        <div id="newsletter-modal-alert" class="newsletter-modal-alert" style="display:none;"></div>
        <form id="newsletter-modal-form" class="newsletter-modal-form" novalidate>
          <input
            type="email"
            id="newsletter-email-input"
            class="newsletter-modal-input"
            placeholder="votre@email.com"
            required
            autocomplete="email"
          >
          <button type="submit" id="newsletter-submit-btn" class="newsletter-modal-submit">
            Je m'abonne
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // Close when clicking backdrop
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeNewsletterModal();
    });

    // Handle form submit
    document.getElementById("newsletter-modal-form").addEventListener("submit", handleNewsletterSubmit);
  }
}

function openNewsletterModal() {
  const modal = document.getElementById("newsletter-modal");
  if (!modal) return;
  const alert = document.getElementById("newsletter-modal-alert");
  const input = document.getElementById("newsletter-email-input");
  const btn = document.getElementById("newsletter-submit-btn");
  if (alert) { alert.style.display = "none"; alert.className = "newsletter-modal-alert"; }
  if (input) { input.value = ""; input.disabled = false; }
  if (btn) { btn.disabled = false; btn.textContent = "Je m'abonne"; }
  modal.classList.add("newsletter-modal-open");
  document.body.style.overflow = "hidden";
  setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeNewsletterModal() {
  const modal = document.getElementById("newsletter-modal");
  if (!modal) return;
  modal.classList.remove("newsletter-modal-open");
  document.body.style.overflow = "";
}

async function handleNewsletterSubmit(e) {
  e.preventDefault();

  const email = document.getElementById("newsletter-email-input")?.value?.trim();
  const btn = document.getElementById("newsletter-submit-btn");
  const alert = document.getElementById("newsletter-modal-alert");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showNewsletterAlert("Veuillez saisir une adresse email valide.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Inscription…";

  try {
    const response = await fetch("/apps/loyalty/subscribe-newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (data.success) {
      const newsletterCard = document.querySelector('[data-task-id="Inscription à la newsletter"]');
      if (newsletterCard) newsletterCard.classList.add("fidelity-completed");

      window.__loyaltyNewsletterSubscribed = true;

      btn.textContent = "Inscrit ✓";

      const message = data.alreadySubscribed
        ? "Vous êtes déjà inscrit à la newsletter."
        : "Merci ! Vous êtes inscrit. Vos 100 points seront crédités sous peu.";
      showNewsletterAlert(message, "success");

      setTimeout(() => closeNewsletterModal(), 3000);
    } else {
      throw new Error(data.error || "Subscription failed");
    }
  } catch (err) {
    console.error("Newsletter subscription error:", err);
    btn.disabled = false;
    btn.textContent = "Je m'abonne";
    showNewsletterAlert("Une erreur est survenue. Veuillez réessayer.", "error");
  }
}

function showNewsletterAlert(message, type) {
  const alert = document.getElementById("newsletter-modal-alert");
  if (!alert) return;
  alert.textContent = message;
  alert.className = `newsletter-modal-alert newsletter-modal-alert--${type}`;
  alert.style.display = "block";
}

window.openNewsletterModal = openNewsletterModal;
window.closeNewsletterModal = closeNewsletterModal;

document.addEventListener("DOMContentLoaded", () => {
  const earnPointsPage = document.getElementById("earn-points-content");

  if (earnPointsPage && earnPointsPage.style.display !== "none") {
    loadEarnPointsData();
  }

  if (earnPointsPage) {
    earnPointsPage.addEventListener("pageShown", () => {
      loadEarnPointsData();
    });
  }
});
