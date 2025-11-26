document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll("button[data-page]");
  const pages = document.querySelectorAll(".loyalty-page");
  const burgerBtn = document.getElementById("burger-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  // Navigation functionality
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const buttonPage = btn.getAttribute("data-page");
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      pages.forEach((page) => {
        page.style.display = "none";
      });

      const targetPage = document.getElementById(buttonPage);
      if (targetPage) {
        targetPage.style.display = "block";

        // Trigger custom event for activate data loading in other pages
        const event = new CustomEvent("pageShown", {
          detail: { pageId: buttonPage },
        });
        targetPage.dispatchEvent(event);
      } else {
        console.error("Page not found with id:", buttonPage);
      }

      // Close mobile menu after clicking
      if (mobileMenu && window.innerWidth <= 768) {
        mobileMenu.classList.remove("open");
        if (burgerBtn) {
          burgerBtn.classList.remove("active");
        }
      }
    });
  });

  // Burger menu toggle
  if (burgerBtn && mobileMenu) {
    burgerBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
      burgerBtn.classList.toggle("active");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!burgerBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove("open");
        burgerBtn.classList.remove("active");
      }
    });
  }

  // Set first button as active
  if (buttons.length > 0) {
    buttons[0].classList.add("active");
  }
});
