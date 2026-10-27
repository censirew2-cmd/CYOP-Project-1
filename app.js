const taskList = document.querySelector("#task-list");
const unscheduledList = document.querySelector("#unscheduled-list");
const taskCount = document.querySelector("#task-count");
const completedCount = document.querySelector("#completion-number");
const agendaTitle = document.querySelector("#agenda-title");
const agendaCount = document.querySelector("#agenda-count");
const agendaEmpty = document.querySelector("#agenda-empty");
const unscheduledCount = document.querySelector("#unscheduled-count");
const unscheduledEmpty = document.querySelector("#unscheduled-empty");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarMonthLabel = document.querySelector("#calendar-month");
const priorityFilter = document.querySelector("#priority-filter");
const dueFilter = document.querySelector("#due-filter");
const exactDateFilter = document.querySelector("#exact-date-filter");
const statusMessage = document.querySelector("#status-message");
const addForm = document.querySelector("#add-form");
const taskInput = document.querySelector("#task-input");
const priorityInput = document.querySelector("#priority-input");
const dueDateInput = document.querySelector("#due-date-input");
const addButton = addForm.querySelector("button");

let tasks = [];
let activeFilter = "all";
let editingIndex = null;
let selectedDate = localDateString(new Date());
let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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

function makeTaskItem(task) {
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
    return item;
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
  return item;
}

function renderCalendar(filteredTasks) {
  calendarGrid.replaceChildren();
  calendarMonthLabel.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    const heading = document.createElement("span");
    heading.className = "calendar-weekday";
    heading.textContent = weekday;
    heading.setAttribute("aria-hidden", "true");
    calendarGrid.append(heading);
  }

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let blank = 0; blank < firstWeekday; blank += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day-spacer";
    spacer.setAttribute("aria-hidden", "true");
    calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = localDateString(new Date(year, month, day));
    const dayTasks = filteredTasks.filter((task) => task.due_date === date);
    const dayButton = document.createElement("button");
    dayButton.className = "calendar-day";
    if (date === localDateString(new Date())) {
      dayButton.classList.add("is-today");
    }
    if (date === selectedDate) {
      dayButton.classList.add("is-selected");
    }
    dayButton.type = "button";
    dayButton.setAttribute("aria-label", `${new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(year, month, day))}, ${dayTasks.length} ${dayTasks.length === 1 ? "task" : "tasks"}`);

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day);
    dayButton.append(number);

    for (const task of dayTasks.slice(0, 2)) {
      const preview = document.createElement("span");
      preview.className = `calendar-task-preview priority-${task.priority || "medium"}${task.done ? " is-done" : ""}`;
      preview.textContent = task.title;
      dayButton.append(preview);
    }
    if (dayTasks.length > 2) {
      const more = document.createElement("span");
      more.className = "calendar-more";
      more.textContent = `+${dayTasks.length - 2} more`;
      dayButton.append(more);
    }
    dayButton.addEventListener("click", () => {
      selectedDate = date;
      renderTasks();
    });
    calendarGrid.append(dayButton);
  }
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

  taskCount.textContent = String(filteredTasks.length);
  completedCount.textContent = String(completed);
  renderCalendar(filteredTasks);

  const selectedDateTasks = filteredTasks.filter((task) => task.due_date === selectedDate);
  const noDateTasks = filteredTasks.filter((task) => !task.due_date);
  agendaTitle.textContent = `Tasks for ${new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${selectedDate}T00:00:00`))}`;
  agendaCount.textContent = `${selectedDateTasks.length} ${selectedDateTasks.length === 1 ? "task" : "tasks"}`;
  unscheduledCount.textContent = `${noDateTasks.length} ${noDateTasks.length === 1 ? "task" : "tasks"}`;

  taskList.replaceChildren(...selectedDateTasks.map(makeTaskItem));
  unscheduledList.replaceChildren(...noDateTasks.map(makeTaskItem));
  if (editingIndex !== null) {
    const activeEditor = document.querySelector(".task-editor .edit-title-input");
    if (activeEditor) {
      activeEditor.focus();
      activeEditor.select();
    }
  }
  agendaEmpty.hidden = selectedDateTasks.length > 0;
  unscheduledEmpty.hidden = noDateTasks.length > 0;
  agendaEmpty.textContent = filteredTasks.length
    ? "No tasks scheduled for this day."
    : "No tasks match these filters.";
  unscheduledEmpty.textContent = filteredTasks.length
    ? "All tasks have a due date."
    : "No tasks match these filters.";
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
    if (data.task.due_date) {
      selectedDate = data.task.due_date;
      visibleMonth = new Date(
        Number(data.task.due_date.slice(0, 4)),
        Number(data.task.due_date.slice(5, 7)) - 1,
        1,
      );
    }
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
    selectedDate = dueDate || localDateString(new Date());
    const [year, month] = selectedDate.split("-").map(Number);
    visibleMonth = new Date(year, month - 1, 1);
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
exactDateFilter.addEventListener("change", () => {
  if (exactDateFilter.value) {
    selectedDate = exactDateFilter.value;
    const [year, month] = selectedDate.split("-").map(Number);
    visibleMonth = new Date(year, month - 1, 1);
  }
  renderTasks();
});

document.querySelector("#previous-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  selectedDate = localDateString(visibleMonth);
  renderTasks();
});

document.querySelector("#next-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  selectedDate = localDateString(visibleMonth);
  renderTasks();
});

document.querySelector("#calendar-today").addEventListener("click", () => {
  const today = new Date();
  visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  selectedDate = localDateString(today);
  renderTasks();
});

request("/api/tasks")
  .then((data) => {
    tasks = data.tasks;
    renderTasks();
  })
  .catch((error) => showError(error.message));
