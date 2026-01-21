async function loadMyProgramData() {
  try {
    // const response = await fetch("/apps/loyalty-widget/api/loyalty");
    // const data = await response.json();
    const data = {
      tasks: [
        {
          task: "1€ dépensé = 1 point",
          reward: 1,
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763561990/busket-icon-task_ghqwbs.svg",
        },
        {
          task: "Créez vous un compte client",
          reward: 15,
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568092/user-icon-task_qryf1s.svg",
        },
        {
          task: "Inscription à la newsletter",
          reward: 100,
          isActive: true,
          imgUrl:
            "https://res.cloudinary.com/dcuqusnsc/image/upload/v1763568125/newaletter-icon-task_zyw8cl.svg",
        },
      ],
    };

    renderMyProgramTasks(data.tasks);
    return data;
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

function renderMyProgramTasks(tasks) {
  const container = document.getElementById("tasks-container");

  if (!container) {
    console.error("tasks-container not found");
    return;
  }
  const tasksHTML = tasks
    .map(
      (task) => `
      <div class="fidelity-task-card" data-task-id="${task.task}">
        <img 
          src="${task.imgUrl}" 
          alt="logo" 
          class="task-icon" 
          width="33" 
          height="33"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"
        >
        <div class="task-card-content">
          <p>${task.reward + " points"}</p>
          <p>${task.task}</p>
        </div>
      </div>
    `,
    )
    .join("");

  container.innerHTML = tasksHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  const myProgramPage = document.getElementById("my-program-content");

  if (myProgramPage && myProgramPage.style.display !== "none") {
    loadMyProgramData();
  }
  if (myProgramPage) {
    myProgramPage.addEventListener("pageShown", () => {
      loadMyProgramData();
    });
  }
});
