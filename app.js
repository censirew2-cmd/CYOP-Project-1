const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const completedCount = document.querySelector("#completion-number");
const progressFill = document.querySelector("#progress-fill");
const priorityFilter = document.querySelector("#priority-filter");
const dueFilter = document.querySelector("#due-filter");
const exactDateFilter = document.querySelector("#exact-date-filter");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyCopy = document.querySelector("#empty-copy");
const statusMessage = document.querySelector("#status-message");
const addForm = document.querySelector("#add-form");
const taskInput = document.querySelector("#task-input");
const priorityInput = document.querySelector("#priority-input");
const dueDateInput = document.querySelector("#due-date-input");
const addButton = addForm.querySelector("button");

let tasks = [];
let activeFilter = "all";
let editingIndex = null;

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const today = localDateString(new Date());
  const visibleTasks = tasks
    .map((task, index) => ({ ...task, index }))
    .filter(({ done }) => (
      activeFilter === "all"
      || (activeFilter === "active" && !done)
      || (activeFilter === "completed" && done)
    ));
  const filteredTasks = visibleTasks.filter((task) => {
    if (priorityFilter.value !== "all" && task.priority !== priorityFilter.value) {
      return false;
    }

    if (exactDateFilter.value && task.due_date !== exactDateFilter.value) {
      return false;
    }

    switch (dueFilter.value) {
      case "scheduled":
        return Boolean(task.due_date);
      case "unscheduled":
        return !task.due_date;
      case "overdue":
        return Boolean(task.due_date) && task.due_date < today && !task.done;
      case "today":
        return task.due_date === today;
      case "upcoming":
        return Boolean(task.due_date) && task.due_date > today;
      default:
        return true;
    }
  });

  taskList.replaceChildren();
  taskCount.textContent = String(tasks.length);
  completedCount.textContent = String(completed);
  progressFill.style.width = `${tasks.length ? (completed / tasks.length) * 100 : 0}%`;
  progressFill.parentElement.setAttribute(
    "aria-label",
    `${completed} of ${tasks.length} tasks completed`,
  );

  for (const task of filteredTasks) {
    const item = document.createElement("li");
    item.className = `task-item${task.done ? " is-done" : ""}`;

    if (task.index === editingIndex) {
      const editor = document.createElement("form");
      editor.className = "task-editor";

      const titleInput = document.createElement("input");
      titleInput.className = "edit-title-input";
      titleInput.type = "text";
      titleInput.maxLength = 500;
      titleInput.value = task.title;
      titleInput.setAttribute("aria-label", "Task title");
      titleInput.required = true;

      const prioritySelect = document.createElement("select");
      prioritySelect.className = "edit-priority-input";
      prioritySelect.setAttribute("aria-label", "Task priority");
      for (const value of ["low", "medium", "high"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${value[0].toUpperCase()}${value.slice(1)} priority`;
        option.selected = (task.priority || "medium") === value;
        prioritySelect.append(option);
      }

      const dueDateInput = document.createElement("input");
      dueDateInput.className = "edit-date-input";
      dueDateInput.type = "date";
      dueDateInput.value = task.due_date || "";
      dueDateInput.setAttribute("aria-label", "Task due date");

      const actions = document.createElement("div");
      actions.className = "edit-actions";
      const saveButton = document.createElement("button");
      saveButton.className = "edit-save-button";
      saveButton.type = "submit";
      saveButton.textContent = "Save";
      const cancelButton = document.createElement("button");
      cancelButton.className = "edit-cancel-button";
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => {
        editingIndex = null;
        renderTasks();
      });
      actions.append(saveButton, cancelButton);
      editor.append(titleInput, prioritySelect, dueDateInput, actions);
      editor.addEventListener("submit", (event) => {
        event.preventDefault();
        saveTask(task.index, {
          title: titleInput.value.trim(),
          priority: prioritySelect.value,
          due_date: dueDateInput.value,
        }, saveButton);
      });
      editor.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          editingIndex = null;
          renderTasks();
        }
      });
      item.append(editor);
      taskList.append(item);
      titleInput.focus();
      titleInput.select();
      continue;
    }

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

    if (task.due_date) {
      const dueDate = document.createElement("time");
      const [year, month, day] = task.due_date.split("-").map(Number);
      const localDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.className = "due-date";
      if (!task.done && localDate < today) {
        dueDate.classList.add("is-overdue");
      }
      dueDate.dateTime = task.due_date;
      dueDate.textContent = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: year === today.getFullYear() ? undefined : "numeric",
      }).format(localDate);
      dueDate.setAttribute("aria-label", `Due ${dueDate.textContent}`);
      item.append(toggle, title, priority, dueDate);
    } else {
      item.append(toggle, title, priority);
    }

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${task.title}`);
    remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12m-10 0 .7 10h6.6L14 6m-6-2h4l1 2m-4 3v4m3-4v4"/></svg>';
    remove.addEventListener("click", () => deleteTask(task.index));

    const edit = document.createElement("button");
    edit.className = "edit-button";
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit ${task.title}`);
    edit.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.8 4.2 3 3M4 16l3.8-.8L16.5 6.5a2.1 2.1 0 0 0-3-3L4.8 12.2 4 16Z"/></svg>';
    edit.addEventListener("click", () => {
      editingIndex = task.index;
      statusMessage.textContent = "";
      renderTasks();
    });

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(edit, remove);
    item.append(actions);
    taskList.append(item);
  }

  emptyState.hidden = filteredTasks.length > 0;
  if (tasks.length === 0) {
    emptyTitle.textContent = "Nothing on your list yet";
    emptyCopy.textContent = "Add your first task above and make today count.";
  } else if (activeFilter === "active" && filteredTasks.length === 0
    && priorityFilter.value === "all" && dueFilter.value === "all" && !exactDateFilter.value) {
    emptyTitle.textContent = "All caught up";
    emptyCopy.textContent = "There are no tasks in progress right now.";
  } else if (activeFilter === "completed" && filteredTasks.length === 0
    && priorityFilter.value === "all" && dueFilter.value === "all" && !exactDateFilter.value) {
    emptyTitle.textContent = "No completed tasks yet";
    emptyCopy.textContent = "Finish a task and it will show up here.";
  } else {
    emptyTitle.textContent = "No tasks match these filters";
    emptyCopy.textContent = "Try changing or clearing a filter to see more tasks.";
  }
}

async function saveTask(index, updates, saveButton) {
  statusMessage.textContent = "";
  saveButton.disabled = true;
  try {
    const data = await request(`/api/tasks/${index}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    tasks[index] = data.task;
    editingIndex = null;
    renderTasks();
  } catch (error) {
    showError(error.message);
    saveButton.disabled = false;
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
  const dueDate = dueDateInput.value;
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
      body: JSON.stringify({ title, priority, due_date: dueDate }),
    });
    tasks.push(data.task);
    taskInput.value = "";
    priorityInput.value = "medium";
    dueDateInput.value = "";
    priorityFilter.value = "all";
    dueFilter.value = "all";
    exactDateFilter.value = "";
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

priorityFilter.addEventListener("change", renderTasks);
dueFilter.addEventListener("change", renderTasks);
exactDateFilter.addEventListener("change", renderTasks);

request("/api/tasks")
  .then((data) => {
    tasks = data.tasks;
    renderTasks();
  })
  .catch((error) => showError(error.message));
