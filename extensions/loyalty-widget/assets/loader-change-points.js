async function loadChangePointsData() {
  console.log("🔄 Loading rewards from /apps/loyalty/rewards...");
  
  try {
    // Fetch real rewards from app proxy
    const response = await fetch("/apps/loyalty/rewards");
    console.log("📡 Response status:", response.status);
    
    const data = await response.json();
    console.log("📦 API Response:", data);

    if (!data.success) {
      console.error("❌ Failed to load rewards:", data.error);
      showEmptyState("Erreur lors du chargement des récompenses");
      return;
    }

    console.log("✅ Found", data.rewards.length, "total rewards");

    // Transform API response to widget format
    const transformedRewards = data.rewards.map(reward => {
      console.log("Processing reward:", reward.name, "Active:", reward.isActive);
      return {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        discountAmount: formatDiscount(reward.discountType, reward.discountValue),
        points: reward.pointsCost,
        imgUrl: reward.imageUrl || "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/14be583296749317600a05691b2b74be3d90b938_prkpsb.png",
        minimalBuy: reward.minimumCartValue 
          ? `${(reward.minimumCartValue / 100).toFixed(2)}€` 
          : "Pas de minimum",
        minimumCartValue: reward.minimumCartValue,
      };
    });

    console.log("🎁 Transformed", transformedRewards.length, "rewards for display");

    if (transformedRewards.length === 0) {
      showEmptyState("Aucune récompense disponible pour le moment");
      return;
    }

    renderChangePointsRewards(transformedRewards);
    return { rewards: transformedRewards };
  } catch (err) {
    console.error("❌ Error loading rewards:", err);
    showEmptyState("Erreur de chargement");
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

function showEmptyState(message = "Aucune récompense disponible pour le moment") {
  const container = document.getElementById("rewards-container");
  if (container) {
    container.innerHTML = `
      <div class="fidelity-reward-card">
        <p style="text-align: center; color: #999;">
          ${message}
        </p>
      </div>
    `;
  }
}

function renderChangePointsRewards(rewards) {
  const container = document.getElementById("rewards-container");

  if (!container) {
    console.error("rewards-container not found");
    return;
  }

  const rewardsHTML = rewards
    .map(
      (reward) => `
      <div class="fidelity-reward-card" data-reward-id="${reward.id}" data-reward-name="${reward.name}">
        <div class="fidelity-reward-card-content">
          <img 
            src="${reward.imgUrl}" 
            alt="${reward.name}" 
            class="reward-icon" 
            width="74" 
            height="74"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"
          >
          <h4>${reward.name}</h4>
          <p class="reward-discount">${reward.discountAmount}</p>
          <p class="reward-points">${reward.points} points</p>
          <button 
            class="fidelity-redeem-btn" 
            data-reward-id="${reward.id}"
            data-points="${reward.points}" 
            data-discount="${reward.discountAmount}"
            data-minimum="${reward.minimumCartValue || 0}"
          >
            J'échange mes points
          </button>
        </div>
        <div class="reward-card-hover">
          <p>Minimum d'achat</p>
          <p>${reward.minimalBuy}</p>
        </div>
      </div>
    `,
    )
    .join("");

  container.innerHTML = rewardsHTML;
  attachRedeemButtonHandlers();
}

async function redeemReward(rewardId, minimumCartValue) {
  console.log("🔄 Redeeming reward:", rewardId);
  
  try {
    // Get current cart total (if available)
    const cartTotal = await getCurrentCartTotal();
    console.log("🛒 Cart total:", cartTotal);

    // Call app proxy to redeem points
    console.log("📡 Calling /apps/loyalty/redeem...");
    const response = await fetch("/apps/loyalty/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rewardId: rewardId,
        cartTotal: cartTotal,
      }),
    });

    console.log("📦 Response status:", response.status);

    const data = await response.json();
    console.log("📦 Response data:", data);

    if (!data.success) {
      // Handle specific error cases
      if (data.requiresLogin) {
        // Redirect to login with return URL
        const returnUrl = window.location.pathname + window.location.search;
        window.location.href = `/account/login?return_url=${encodeURIComponent(returnUrl)}`;
        return; // Stop execution
      }
      if (data.error === "Insufficient points") {
        throw new Error(`Points insuffisants. Vous avez ${data.current} points, mais ${data.required} sont nécessaires.`);
      }
      // Minimum cart validation is now handled by Shopify at checkout
      // via the discount code's minimum purchase requirement
      throw new Error(data.error || "Échec de l'échange. Veuillez réessayer.");
    }

    console.log("✅ Redemption successful!");

    // Return discount code and details
    return {
      code: data.discountCode,
      minimalBuy: minimumCartValue 
        ? `${(minimumCartValue / 100).toFixed(2)}€` 
        : "Pas de minimum",
      imgUrl: "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/4c7268a2cfc528f2d73dfa085e60e3794a8db3fb_hkv36m.png",
      newBalance: data.newBalance,
    };
  } catch (err) {
    console.error("Error redeeming reward:", err);
    throw err;
  }
}

// Helper function to get current cart total
async function getCurrentCartTotal() {
  try {
    // Fetch cart data from Shopify
    const cartResponse = await fetch('/cart.js');
    const cart = await cartResponse.json();
    return cart.total_price || 0; // in cents
  } catch (err) {
    console.log("Could not fetch cart total, proceeding without validation");
    return 0;
  }
}

function attachRedeemButtonHandlers() {
  const buttons = document.querySelectorAll(".fidelity-redeem-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (button.classList.contains("fidelity-processing")) {
        return;
      }

      // Double-check login status (should already be handled, but just in case)
      if (!isCustomerLoggedIn()) {
        redirectToLogin();
        return;
      }

      const rewardId = button.getAttribute("data-reward-id");
      const minimumCartValue = parseInt(button.getAttribute("data-minimum") || "0");
      const originalText = button.textContent;
      
      button.textContent = "Chargement...";
      button.disabled = true;
      button.classList.add("fidelity-processing");

      try {
        const result = await redeemReward(rewardId, minimumCartValue);
        showRewardModal(result.code, result.minimalBuy, result.imgUrl);
        
        // Refresh customer balance after redemption
        if (window.loadCustomerBalance) {
          window.loadCustomerBalance();
        }
      } catch (err) {
        const errorMessage = err.message || "Une erreur s'est produite. Veuillez réessayer.";
        alert(errorMessage);
      } finally {
        button.classList.remove("fidelity-processing");
        button.textContent = originalText;
        button.disabled = false;
      }
    });
  });
}

// Helper function to check if customer is logged in
function isCustomerLoggedIn() {
  // Check Liquid-generated class (most reliable)
  const loyaltyRoot = document.getElementById('loyalty-spa-root');
  if (loyaltyRoot && loyaltyRoot.classList.contains('customer-logged-in')) {
    return true;
  }
  
  // Check if customer-id data attribute exists and has value
  if (loyaltyRoot && loyaltyRoot.dataset.customerId) {
    return true;
  }
  
  // Check if Shopify customer object exists
  if (typeof window.Shopify !== 'undefined' && window.Shopify.customer) {
    return window.Shopify.customer.id !== null;
  }
  
  return false;
}

function showRewardModal(code, minimalBuy, imgUrl) {
  let modal = document.getElementById("reward-success-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reward-success-modal";
    modal.className = "fidelity-reward-modal";
    modal.innerHTML = `
      <div class="fidelity-reward-modal-overlay"></div>
      <div class="fidelity-reward-modal-content">
        <img src="${imgUrl}" alt="logo" class="reward-modal-icon" width="135" height="135">
        <h3>Félicitations !</h3>
        <p class="modal-message">Tu as échangé tes points, voici ton code :</p>
        <div class="fidelity-modal-code-container">
        <p class="fidelity-modal-code">${code}</p> 
        <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="fidelity-code-revealed-logo">
        </div>
        <p class="fidelity-modal-info">Retrouve ta réduction dans la section « Mes récompenses ».</p>
        <p class="fidelity-modal-minimum">Minimum de commande : ${minimalBuy}</p>
        <button class="fidelity-modal-btn" onclick="closeRewardModal()">J'en profite maintenant</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.querySelector(".fidelity-modal-code").textContent = code;
    modal.querySelector(".fidelity-modal-minimum").textContent =
      `Minimum de commande : ${minimalBuy}`;
    modal.querySelector(".reward-modal-icon").src = imgUrl;
  }

  modal.classList.add("fidelity-active");
  document.body.style.overflow = "hidden";
  modal
    .querySelector(".fidelity-reward-modal-overlay")
    .addEventListener("click", closeRewardModal);
  attachModalCodeCopyHandler(code);
}

function attachModalCodeCopyHandler(code) {
  const codeContainer = document.querySelector(".fidelity-modal-code-container");
  if (!codeContainer) return;
  const newCodeContainer = codeContainer.cloneNode(true);
  codeContainer.parentNode.replaceChild(newCodeContainer, codeContainer);

  let isCopying = false;
  newCodeContainer.addEventListener("click", async () => {
    if (isCopying) return;

    try {
      await navigator.clipboard.writeText(code);

      isCopying = true;
      const codeText = newCodeContainer.querySelector(".fidelity-modal-code");
      codeText.textContent = "Copié!";
      newCodeContainer.classList.add("fidelity-copied");

      setTimeout(() => {
        codeText.textContent = code;
        newCodeContainer.classList.remove("fidelity-copied");
        isCopying = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
      isCopying = false;
    }
  });
  newCodeContainer.style.cursor = "pointer";
}

function closeRewardModal() {
  const modal = document.getElementById("reward-success-modal");
  if (modal) {
    modal.classList.remove("fidelity-active");
    document.body.style.overflow = "";
  }
}

window.closeRewardModal = closeRewardModal;

document.addEventListener("DOMContentLoaded", () => {
  const changePointsPage = document.getElementById("change_points-content");
  
  if (changePointsPage && changePointsPage.style.display !== "none") {
    // Check if user is logged in before loading rewards
    if (!isCustomerLoggedIn()) {
      redirectToLogin();
    } else {
      loadChangePointsData();
    }
  }
  
  if (changePointsPage) {
    changePointsPage.addEventListener("pageShown", () => {
      // Check login status when navigating to this tab
      if (!isCustomerLoggedIn()) {
        redirectToLogin();
      } else {
        loadChangePointsData();
      }
    });
  }
});

// Redirect to login with return URL
function redirectToLogin() {
  const returnUrl = window.location.pathname + window.location.search;
  console.log("🔒 Customer not logged in, redirecting to login...");
  window.location.href = `/account/login?return_url=${encodeURIComponent(returnUrl)}`;
}
