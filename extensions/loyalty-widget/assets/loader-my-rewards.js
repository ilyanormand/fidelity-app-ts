async function loadMyRewardsData() {
  console.log("🔄 Loading customer redemptions from /apps/loyalty/redemptions...");
  
  try {
    // Fetch customer redemptions from app proxy
    const response = await fetch("/apps/loyalty/redemptions");
    console.log("📡 Response status:", response.status);
    
    const data = await response.json();
    console.log("📦 API Response:", data);

    if (!data.success) {
      console.error("❌ Failed to load redemptions:", data.error);
      renderMyRewards([]);
      return;
    }

    console.log("✅ Found", data.redemptions.length, "redemptions");

    // Transform API response to widget format
    const transformedRedemptions = data.redemptions.map(redemption => ({
      id: redemption.id,
      code: redemption.discountCode,
      discountAmount: formatDiscount(
        redemption.reward.discountType, 
        redemption.reward.discountValue
      ),
      expiryDate: formatDate(redemption.createdAt), // Show redemption date
      imgUrl: redemption.reward.imageUrl || "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/14be583296749317600a05691b2b74be3d90b938_prkpsb.png",
      used: false, // For now, all are unused - could track this in future
      minimalBuy: redemption.reward.minimumCartValue
        ? `${(redemption.reward.minimumCartValue / 100).toFixed(2)}€`
        : "Pas de minimum",
      rewardName: redemption.reward.name,
      pointsSpent: redemption.pointsSpent,
    }));

    console.log("🎁 Transformed", transformedRedemptions.length, "redemptions for display");

    renderMyRewards(transformedRedemptions);
    return { rewards: transformedRedemptions };
  } catch (err) {
    console.error("❌ Error loading my rewards:", err);
    renderMyRewards([]);
  }
}

function formatDiscount(discountType, discountValue) {
  switch (discountType) {
    case "percentage":
      return `${discountValue}%`;
    case "fixed_amount":
      return `${(discountValue / 100).toFixed(2)}€`;
    case "free_shipping":
      return "Livraison gratuite";
    default:
      return `${discountValue}`;
  }
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
      <div class="fidelity-my-reward-card ${reward.used ? "fidelity-used" : ""}" data-reward-code="${reward.code}">
        <div class="fidelity-my-reward-card-content">
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
          <button class="fidelity-use-reward-btn ${reward.used ? "fidelity-disabled" : ""}" ${reward.used ? "disabled" : ""}>
            ${reward.used ? "Utilisé" : "J'utilise ma réduction"}
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
  const buttons = document.querySelectorAll(".fidelity-use-reward-btn:not(.fidelity-disabled)");

  buttons.forEach((button) => {
    let isCopying = false;

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = button.closest(".fidelity-my-reward-card");
      const code = card.getAttribute("data-reward-code");

      if (!code) return;

      // First click: reveal code
      if (!button.classList.contains("fidelity-code-revealed")) {
        button.innerHTML = `
          <span>${code}</span>
          <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="fidelity-code-revealed-logo">
        `;
        button.classList.add("fidelity-code-revealed");
      }
      // Second click: copy code to clipboard
      else {
        if (isCopying) return;

        try {
          await navigator.clipboard.writeText(code);

          isCopying = true;

          // Show feedback
          button.innerHTML = `<span>Copié!</span>`;
          button.classList.add("fidelity-copied");

          setTimeout(() => {
            button.innerHTML = `
              <span>${code}</span>
              <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="fidelity-code-revealed-logo">
            `;
            button.classList.remove("fidelity-copied");
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
