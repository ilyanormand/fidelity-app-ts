async function loadChangePointsData() {
  try {
    // const response = await fetch("/apps/loyalty-widget/api/rewards");
    // const data = await response.json();
    const data = {
      rewards: [
        {
          discountAmount: "45€",
          points: 700,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/4c7268a2cfc528f2d73dfa085e60e3794a8db3fb_hkv36m.png",
          minimalBuy: "100€",
        },
        {
          discountAmount: "35€",
          points: 600,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662424/108297663eeb91ee8cc34d4ddd0676a97674c26a_ib1c7w.png",
          minimalBuy: "100€",
        },
        {
          discountAmount: "27€",
          points: 500,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662424/9fb5ee988c3620c1359d72e636c84e7b96da064b_havxvd.png",
          minimalBuy: "100€",
        },
        {
          discountAmount: "21€",
          points: 400,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662424/9f7ec9a230e3256591f56f6d7ae9ed373616928e_n5afcg.png",
          minimalBuy: "100€",
        },
        {
          discountAmount: "9€",
          points: 200,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/14be583296749317600a05691b2b74be3d90b938_prkpsb.png",
          minimalBuy: "100€",
        },
        {
          discountAmount: "4€",
          points: 100,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662424/3068aeb1c128683d9ead364eb1b0ac4bf4976cef_m2kkyi.png",
          minimalBuy: "100€",
        },
      ],
    };

    renderChangePointsRewards(data.rewards);
    return data;
  } catch (err) {
    console.error("Error loading rewards:", err);
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
      <div class="reward-card" data-reward-name="${reward.name}">
        <div class="reward-card-content">
          <img 
            src="${reward.imgUrl}" 
            alt="logo" 
            class="reward-icon" 
            width="74" 
            height="74"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"
          >
          <h4>Bon d'achat de ${reward.discountAmount}</h4>
          <p>${reward.points} points</p>
          <button class="redeem-btn" data-points="${reward.points}" data-discount="${reward.discountAmount}">
            J'échange mes points
          </button>
        </div>
        <div class="reward-card-hover">
          <p>Minimum </p>
          <p>d'achat ${reward.minimalBuy}</p>
        </div>
      </div>
    `,
    )
    .join("");

  container.innerHTML = rewardsHTML;
  attachRedeemButtonHandlers();
}

async function redeemReward(points, discountAmount) {
  try {
    // const customerId = window.loyaltyConfig?.customerId || "customer_123";
    // const response = await fetch("/apps/loyalty-widget/api/redeem-reward", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     customerId: customerId,
    //     points: points,
    //     discountAmount: discountAmount,
    //   }),
    // });

    // Mock response
    const data = {
      code: "FWN-12345",
      minimalBuy: "100€",
      imgUrl:
        "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763662425/4c7268a2cfc528f2d73dfa085e60e3794a8db3fb_hkv36m.png",
    };

    return data;
  } catch (err) {
    console.error("Error redeeming reward:", err);
    throw err;
  }
}

function attachRedeemButtonHandlers() {
  const buttons = document.querySelectorAll(".redeem-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (button.classList.contains("processing")) {
        return;
      }

      const points = button.getAttribute("data-points");
      const discountAmount = button.getAttribute("data-discount");
      const originalText = button.textContent;
      button.textContent = "Chargement...";
      button.disabled = true;
      button.classList.add("processing");

      try {
        const result = await redeemReward(points, discountAmount);
        showRewardModal(result.code, result.minimalBuy, result.imgUrl);
      } catch (err) {
        alert("Une erreur s'est produite. Veuillez réessayer.");
      } finally {
        button.classList.remove("processing");
        button.textContent = originalText;
        button.disabled = false;
      }
    });
  });
}

function showRewardModal(code, minimalBuy, imgUrl) {
  let modal = document.getElementById("reward-success-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reward-success-modal";
    modal.className = "reward-modal";
    modal.innerHTML = `
      <div class="reward-modal-overlay"></div>
      <div class="reward-modal-content">
        <img src="${imgUrl}" alt="logo" class="reward-modal-icon" width="135" height="135">
        <h3>Félicitations !</h3>
        <p class="modal-message">Tu as échangé tes points, voici ton code :</p>
        <div class="modal-code-container">
        <p class="modal-code">${code}</p> 
        <img src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763730011/b37ae00dc6d5f9bd21d959b9577a8c6f607e53d2_ommzhe.svg" alt="copy" class="code-revealed-logo">
        </div>
        <p class="modal-info">Retrouve ta réduction dans la section « Mes récompenses ».</p>
        <p class="modal-minimum">Minimum de commande : ${minimalBuy}</p>
        <button class="modal-btn" onclick="closeRewardModal()">J'en profite maintenant</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.querySelector(".modal-code").textContent = code;
    modal.querySelector(".modal-minimum").textContent =
      `Minimum de commande : ${minimalBuy}`;
    modal.querySelector(".reward-modal-icon").src = imgUrl;
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
  modal
    .querySelector(".reward-modal-overlay")
    .addEventListener("click", closeRewardModal);
  attachModalCodeCopyHandler(code);
}

function attachModalCodeCopyHandler(code) {
  const codeContainer = document.querySelector(".modal-code-container");
  if (!codeContainer) return;
  const newCodeContainer = codeContainer.cloneNode(true);
  codeContainer.parentNode.replaceChild(newCodeContainer, codeContainer);

  let isCopying = false;
  newCodeContainer.addEventListener("click", async () => {
    if (isCopying) return;

    try {
      await navigator.clipboard.writeText(code);

      isCopying = true;
      const codeText = newCodeContainer.querySelector(".modal-code");
      codeText.textContent = "Copié!";
      newCodeContainer.classList.add("copied");

      setTimeout(() => {
        codeText.textContent = code;
        newCodeContainer.classList.remove("copied");
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
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
}

window.closeRewardModal = closeRewardModal;

document.addEventListener("DOMContentLoaded", () => {
  const changePointsPage = document.getElementById("change_points-content");
  if (changePointsPage && changePointsPage.style.display !== "none") {
    loadChangePointsData();
  }
  if (changePointsPage) {
    changePointsPage.addEventListener("pageShown", () => {
      loadChangePointsData();
    });
  }
});
