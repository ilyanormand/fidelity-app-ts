async function loadEarnPointsData() {
  try {
    // const response = await fetch("/apps/loyalty-widget/api/loyalty");
    // const data = await response.json();
    const data = {
      tasks: [
        {
          task: "1€ dépensé = 1 point",
          reward: 1,
          isCompleted: false,
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763561990/busket-icon-task_ghqwbs.svg",
          link: "https://www.google.com",
          textButton: "Je passe commande",
        },
        {
          task: "Créez vous un compte client",
          reward: 15,
          isCompleted: true, // Тестовая completed задача
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568092/user-icon-task_qryf1s.svg",
          link: "https://www.google.com",
          textButton: "Je me crée un compte",
        },
        {
          task: "Inscription à la newsletter",
          reward: 100,
          isCompleted: false,
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568125/newaletter-icon-task_zyw8cl.svg",
          link: "https://www.google.com",
          textButton: "Je m’abonne",
        },
      ],
    };

    renderEarnPointsTasks(data.tasks);
    return data;
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

function renderEarnPointsTasks(tasks) {
  const container = document.getElementById("earn-points-tasks");

  if (!container) {
    console.error("earn-points-tasks container not found");
    return;
  }
  const tasksHTML = tasks
    .map(
      (task) => `
      <div class="task-card-earn-points ${task.isCompleted ? "completed" : ""}" data-task-id="${task.task}">
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
        <div style="flex: 1;"></div>
        <a href="${task.link}" class="task-button">${task.textButton}</a>
      </div>
    `,
    )
    .join("");

  container.innerHTML = tasksHTML;
}

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
