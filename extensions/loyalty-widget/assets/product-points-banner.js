(async function () {
  const banners = document.querySelectorAll(
    '.ppb-wrapper[data-customer-logged-in="true"]'
  );

  if (!banners.length) return;

  // Fetch customer balance and rewards once — these don't change on cart update
  let customerBalance = 0;
  let rewards = [];

  try {
    const [customerRes, rewardsRes] = await Promise.all([
      fetch("/apps/loyalty/customer", {
        headers: { "ngrok-skip-browser-warning": "true" },
      }).then((r) => r.json()),
      fetch("/apps/loyalty/rewards", {
        headers: { "ngrok-skip-browser-warning": "true" },
      }).then((r) => r.json()),
    ]);

    customerBalance = customerRes?.customer?.currentBalance || 0;
    rewards = (rewardsRes?.rewards || []).sort(
      (a, b) => a.pointsCost - b.pointsCost
    );
  } catch (e) {
    console.error("[PPB] Error fetching customer/rewards:", e);
    return;
  }

  // Update all banners based on the latest cart total
  async function updateBanners() {
    let cartPoints = 0;
    try {
      const cart = await fetch("/cart.js").then((r) => r.json());
      cartPoints = Math.floor((cart?.total_price || 0) / 100);
    } catch (e) {
      console.error("[PPB] Error fetching cart:", e);
    }

    banners.forEach((banner) => {
      const productPrice = parseInt(banner.dataset.productPrice || "0");
      const productPoints = Math.floor(productPrice / 100);
      const id = banner.dataset.productId;

      const progressFill = document.getElementById(`ppb-progress-${id}`);
      const description = document.getElementById(`ppb-description-${id}`);

      if (!progressFill || !description) return;

      // Points earned from current cart + this product
      const cartEarnedPoints = cartPoints + productPoints;

      // Next reward based on the customer's current account balance
      const nextReward = rewards.find((r) => r.pointsCost > customerBalance);

      if (!nextReward) {
        description.textContent =
          "Toutes les récompenses sont débloquées avec votre solde actuel !";
        progressFill.style.width = "100%";
        return;
      }

      // Progress bar: customer's current balance toward next reward
      const progress = Math.min(
        Math.round((customerBalance / nextReward.pointsCost) * 100),
        100
      );
      progressFill.style.width = `${progress}%`;

      description.textContent = `Avec ce panier : ${cartEarnedPoints} points sur ${nextReward.pointsCost} pour débloquer une récompense de "${nextReward.name}"`;
    });
  }

  // Initial render
  await updateBanners();

  // React to cart changes via fetch interception
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = (args[0]?.toString() || "").split("?")[0];
    if (
      url.endsWith("/cart/add.js") ||
      url.endsWith("/cart/change.js") ||
      url.endsWith("/cart/update.js") ||
      url.endsWith("/cart/clear.js")
    ) {
      // Clone response so it can still be consumed by the original caller
      response.clone().json().then(() => updateBanners()).catch(() => updateBanners());
    }
    return response;
  };

  // Also listen to the standard theme event (Dawn, Impulse, etc.)
  document.addEventListener("cart:updated", updateBanners);

  // Expose for manual trigger if needed
  window.ppbUpdate = updateBanners;
})();
