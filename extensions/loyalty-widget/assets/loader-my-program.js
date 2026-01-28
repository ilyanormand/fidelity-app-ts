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
    checkTasksCompletionAndToggleRewardsButton(data.tasks);
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

// Check if all first three tasks are completed and toggle rewards button visibility
function checkTasksCompletionAndToggleRewardsButton(tasks) {
  // Get first three tasks
  const firstThreeTasks = tasks.slice(0, 3);
  
  // Check if all three tasks are completed
  const allCompleted = firstThreeTasks.length === 3 && 
                       firstThreeTasks.every(task => task.isCompleted === true);
  
  // Find all buttons with data-page="my-rewards-content"
  const rewardsButtons = document.querySelectorAll('button[data-page="my-rewards-content"]');
  
  rewardsButtons.forEach(button => {
    if (allCompleted) {
      button.style.display = '';
    } else {
      button.style.display = 'none';
    }
  });
}

// Make function globally available
window.checkTasksCompletionAndToggleRewardsButton = checkTasksCompletionAndToggleRewardsButton;

document.addEventListener("DOMContentLoaded", () => {
  const myProgramPage = document.getElementById("my-program-content");

  // Load data immediately to check task completion status
  loadMyProgramData();

  if (myProgramPage) {
    myProgramPage.addEventListener("pageShown", () => {
      loadMyProgramData();
    });
  }
});
