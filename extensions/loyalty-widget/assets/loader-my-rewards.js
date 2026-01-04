async function loadMyRewardsData() {
  try {
    // const response = await fetch("/apps/loyalty-widget/api/my-rewards");
    // const data = await response.json();
    const data = {
      rewards: [
        {
          code: "FIDELITY45",
          discountAmount: "45€",
          expiryDate: "31/03/2025",
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/4c7268a2cfc528f2d73dfa085e60e3794a8db3fb_hkv36m.png",
          used: false,
          minimalBuy: "100€",
        },
        {
          code: "FIDELITY27",
          discountAmount: "27€",
          expiryDate: "15/02/2025",
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662424/9fb5ee988c3620c1359d72e636c84e7b96da064b_havxvd.png",
          used: false,
          minimalBuy: "100€",
        },
        {
          code: "FIDELITY9",
          discountAmount: "9€",
          expiryDate: "31/01/2025",
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/14be583296749317600a05691b2b74be3d90b938_prkpsb.png",
          used: true,
          minimalBuy: "100€",
        },
      ],
    };

    renderMyRewards(data.rewards);
    return data;
  } catch (err) {
    console.error("Error loading my rewards:", err);
  }
}

function renderMyRewards(rewards) {
  const container = document.getElementById("my-rewards-list");

  if (!container) {
    console.error("my-rewards-list not found");
    return;
  }

  if (rewards.length === 0) {
    container.innerHTML = `
      <div class="my-rewards-empty">
        <p>Vous n'avez pas encore de récompenses.</p>
        <p>Échangez vos points pour obtenir des bons d'achat !</p>
      </div>
    `;
    return;
  }

  const rewardsHTML = rewards
    .map(
      (reward) => `
      <div class="my-reward-card ${reward.used ? "used" : ""}" data-reward-code="${reward.code}">
        <div class="my-reward-card-content">
          <img 
            src="${reward.imgUrl}" 
            alt="logo" 
            class="my-reward-icon" 
            width="74" 
            height="74"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"
          >
          <h4>Bon d'achat de ${reward.discountAmount}</h4>
          <p style="font-size: 12px; margin-bottom: 10px;">Expire le ${reward.expiryDate}</p>
          <button class="use-reward-btn ${reward.used ? "disabled" : ""}" ${reward.used ? "disabled" : ""}>
            ${reward.used ? "Utilisé" : "J’utilise ma réduction"}
          </button>
        </div>
        <div class="my-reward-card-hover">
          <p>Minimum </p>
          <p>d'achat ${reward.minimalBuy}</p>
        </div>
      </div>
    `,
    )
    .join("");

  container.innerHTML = rewardsHTML;

  // Add click handlers to buttons
  attachRewardButtonHandlers();
}

function attachRewardButtonHandlers() {
  const buttons = document.querySelectorAll(".use-reward-btn:not(.disabled)");

  buttons.forEach((button) => {
    let isCopying = false;

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = button.closest(".my-reward-card");
      const code = card.getAttribute("data-reward-code");

      if (!code) return;

      // First click: reveal code
      if (!button.classList.contains("code-revealed")) {
        button.innerHTML = `
          <span>${code}</span>
          <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="code-revealed-logo">
        `;
        button.classList.add("code-revealed");
      }
      // Second click: copy code to clipboard
      else {
        if (isCopying) return;

        try {
          await navigator.clipboard.writeText(code);

          isCopying = true;

          // Show feedback
          button.innerHTML = `<span>Copié!</span>`;
          button.classList.add("copied");

          setTimeout(() => {
            button.innerHTML = `
              <span>${code}</span>
              <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="code-revealed-logo">
            `;
            button.classList.remove("copied");
            isCopying = false;
          }, 2000);
        } catch (err) {
          console.error("Failed to copy code:", err);
          isCopying = false;
        }
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const myRewardsPage = document.getElementById("my-rewards-content");
  if (myRewardsPage && myRewardsPage.style.display !== "none") {
    loadMyRewardsData();
  }
  if (myRewardsPage) {
    myRewardsPage.addEventListener("pageShown", () => {
      loadMyRewardsData();
    });
  }
});
