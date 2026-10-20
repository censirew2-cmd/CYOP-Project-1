const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const completedCount = document.querySelector("#completion-number");
const progressFill = document.querySelector("#progress-fill");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyCopy = document.querySelector("#empty-copy");
const statusMessage = document.querySelector("#status-message");
const addForm = document.querySelector("#add-form");
const taskInput = document.querySelector("#task-input");
const priorityInput = document.querySelector("#priority-input");
const addButton = addForm.querySelector("button");

let tasks = [];
let activeFilter = "all";

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

function showError(message) {
  statusMessage.textContent = message;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

function renderTasks() {
  const completed = tasks.filter((task) => task.done).length;
  const visibleTasks = tasks
    .map((task, index) => ({ ...task, index }))
    .filter(({ done }) => (
      activeFilter === "all"
      || (activeFilter === "active" && !done)
      || (activeFilter === "completed" && done)
    ));

  taskList.replaceChildren();
  taskCount.textContent = String(tasks.length);
  completedCount.textContent = String(completed);
  progressFill.style.width = `${tasks.length ? (completed / tasks.length) * 100 : 0}%`;
  progressFill.parentElement.setAttribute(
    "aria-label",
    `${completed} of ${tasks.length} tasks completed`,
  );

  for (const task of visibleTasks) {
    const item = document.createElement("li");
    item.className = `task-item${task.done ? " is-done" : ""}`;

    const toggle = document.createElement("button");
    toggle.className = `task-toggle${task.done ? " is-done" : ""}`;
    toggle.type = "button";
    toggle.setAttribute("aria-label", `${task.done ? "Mark incomplete" : "Mark complete"}: ${task.title}`);
    toggle.setAttribute("aria-pressed", String(task.done));
    if (task.done) {
      toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5"/></svg>';
    }
    toggle.addEventListener("click", () => updateTask(task.index, !task.done));

    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;

    const priority = document.createElement("span");
    priority.className = `priority-badge priority-${task.priority || "medium"}`;
    priority.textContent = `${task.priority || "medium"} priority`;

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${task.title}`);
    remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12m-10 0 .7 10h6.6L14 6m-6-2h4l1 2m-4 3v4m3-4v4"/></svg>';
    remove.addEventListener("click", () => deleteTask(task.index));

    item.append(toggle, title, priority, remove);
    taskList.append(item);
  }

  emptyState.hidden = visibleTasks.length > 0;
  if (tasks.length === 0) {
    emptyTitle.textContent = "Nothing on your list yet";
    emptyCopy.textContent = "Add your first task above and make today count.";
  } else if (activeFilter === "active") {
    emptyTitle.textContent = "All caught up";
    emptyCopy.textContent = "There are no tasks in progress right now.";
  } else {
    emptyTitle.textContent = "No completed tasks yet";
    emptyCopy.textContent = "Finish a task and it will show up here.";
  }
}

async function updateTask(index, done) {
  statusMessage.textContent = "";
  try {
    await request(`/api/tasks/${index}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    });
    tasks[index].done = done;
    renderTasks();
  } catch (error) {
    showError(error.message);
  }
}

async function deleteTask(index) {
  statusMessage.textContent = "";
  try {
    await request(`/api/tasks/${index}`, { method: "DELETE" });
    tasks.splice(index, 1);
    renderTasks();
  } catch (error) {
    showError(error.message);
  }
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  const priority = priorityInput.value;
  if (!title) {
    showError("Task description cannot be empty.");
    taskInput.focus();
    return;
  }

  addButton.disabled = true;
  statusMessage.textContent = "";
  try {
    const data = await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title, priority }),
    });
    tasks.push(data.task);
    taskInput.value = "";
    priorityInput.value = "medium";
    activeFilter = "all";
    document.querySelectorAll(".filter-button").forEach((button) => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderTasks();
    taskInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    addButton.disabled = false;
  }
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("is-active", selected);
      filterButton.setAttribute("aria-pressed", String(selected));
    });
    renderTasks();
  });
});

request("/api/tasks")
  .then((data) => {
    tasks = data.tasks;
    renderTasks();
  })
  .catch((error) => showError(error.message));
