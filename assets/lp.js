document.addEventListener("DOMContentLoaded", function () {
  const mobileButton = document.querySelector("[data-mobile-menu-button]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");

  if (mobileButton && mobileMenu) {
    mobileButton.addEventListener("click", function () {
      const isOpen = !mobileMenu.classList.contains("hidden");
      mobileMenu.classList.toggle("hidden", isOpen);
      mobileButton.setAttribute("aria-expanded", String(!isOpen));
    });

    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileMenu.classList.add("hidden");
        mobileButton.setAttribute("aria-expanded", "false");
      });
    });
  }

  const headings = document.querySelectorAll("main h2, main h3");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.25 }
    );

    headings.forEach(function (heading) {
      heading.classList.add("reveal-heading");
      observer.observe(heading);
    });
  }

  const filterButtons = document.querySelectorAll("[data-filter]");
  const sampleCards = document.querySelectorAll("[data-category]");

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const filter = button.getAttribute("data-filter");
      filterButtons.forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
      sampleCards.forEach(function (card) {
        card.hidden = filter !== "all" && card.getAttribute("data-category") !== filter;
      });
    });
  });

  const modal = document.querySelector("[data-image-modal]");
  const modalImage = document.querySelector("[data-modal-image]");
  const modalClose = document.querySelector("[data-modal-close]");
  let lastFocusedElement = null;

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  document.querySelectorAll("[data-sample-image]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!modal || !modalImage) return;
      const image = button.querySelector("img");
      if (!image) return;
      lastFocusedElement = button;
      modalImage.src = image.src;
      modalImage.alt = image.alt;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (modalClose) modalClose.focus();
    });
  });

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
  });

  document.querySelectorAll("[data-current-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });
});
