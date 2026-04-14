(async function () {
  const banners = document.querySelectorAll('.ppb-wrapper');

  if (!banners.length) return;

  const isLoggedIn = banners[0].dataset.customerLoggedIn === "true";

  if (!isLoggedIn) return;

  let customerBalance = 0;
  let rewards = [];

  try {
    const results = await Promise.all([
      fetch("/apps/loyalty/rewards", {
        headers: { "ngrok-skip-browser-warning": "true" },
      }).then((r) => r.json()),
      fetch("/apps/loyalty/customer", {
        headers: { "ngrok-skip-browser-warning": "true" },
      }).then((r) => r.json()),
    ]);
    rewards = (results[0]?.rewards || []).sort(
      (a, b) => a.pointsCost - b.pointsCost
    );
    customerBalance = results[1]?.customer?.currentBalance || 0;
  } catch (e) {
    console.error("[PPB] Error fetching data:", e);
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

      // Cart points + existing customer balance = total points after purchase
      const cartEarnedPoints = cartPoints + customerBalance;

      // Hide progress bar and description if user has no points at all
      if (cartEarnedPoints === 0) {
        progressFill.parentElement.style.display = "none";
        description.style.display = "none";
        return;
      }

      // Restore visibility
      progressFill.parentElement.style.display = "";
      description.style.display = "";

      // Next reward based on total points after purchase
      const nextReward = rewards.find((r) => r.pointsCost > cartEarnedPoints);

      const allUnlockedText = banner.dataset.textAllUnlocked || "Toutes les récompenses sont débloquées avec votre solde actuel !";
      const progressTemplate = banner.dataset.textProgress || 'Avec ce panier : [points] points sur [target] pour débloquer une récompense de "[reward]"';

      if (!nextReward) {
        description.textContent = allUnlockedText;
        progressFill.style.width = "100%";
        return;
      }

      const progress = Math.min(
        Math.round((cartEarnedPoints / nextReward.pointsCost) * 100),
        100
      );
      progressFill.style.width = `${progress}%`;

      const remainingPoints = nextReward.pointsCost - cartEarnedPoints;

      description.textContent = progressTemplate
        .replaceAll("[points]", cartEarnedPoints)
        .replaceAll("[target]", nextReward.pointsCost)
        .replaceAll("[reward]", nextReward.name)
        .replaceAll("[remainingPoints]", remainingPoints);
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
