"""A small web-based to-do list manager."""

import json
import logging
import re
import tempfile
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


TASKS_FILE = Path(__file__).with_name("tasks.json")
WEB_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}
TASK_PATH = re.compile(r"^/api/tasks/(\d+)$")
TASKS_LOCK = threading.Lock()
MAX_REQUEST_SIZE = 16_384
PRIORITIES = {"low", "medium", "high"}
DATE_FORMAT = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class InvalidRequest(ValueError):
    """A client request did not contain valid task data."""


def is_valid_due_date(value):
    """Return True if the value is a valid ISO 8601 date string, otherwise False."""
    if not isinstance(value, str):
        return False
    if not value:
        return True
    if DATE_FORMAT.fullmatch(value) is None:
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def load_tasks():
    """Read saved tasks, returning an empty list on first launch."""
    try:
        with TASKS_FILE.open("r", encoding="utf-8") as file:
            tasks = json.load(file)
    except FileNotFoundError:
        return []

    if not isinstance(tasks, list) or any(
        not isinstance(task, dict)
        or not isinstance(task.get("title"), str)
        or not isinstance(task.get("done"), bool)
        or not isinstance(task.get("priority", "medium"), str)
        or task.get("priority", "medium") not in PRIORITIES
        or not is_valid_due_date(task.get("due_date", ""))
        for task in tasks
    ):
        raise ValueError(
            "tasks.json must contain a list of tasks with titles "
            "and completion states."
        )
    for task in tasks:
        task.setdefault("priority", "medium")
        task.setdefault("due_date", "")
    return tasks


def save_tasks(tasks):
    """Atomically save tasks next to this script."""
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=TASKS_FILE.parent,
            delete=False,
        ) as file:
            temporary_path = Path(file.name)
            json.dump(tasks, file, indent=2)
            file.write("\n")
        temporary_path.replace(TASKS_FILE)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


class TodoRequestHandler(BaseHTTPRequestHandler):
    """A request handler for the to-do manager web app."""
    def send_json(self, status, data):
        """Send a JSON response with the given status code and data."""
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self):
        """Read and parse a JSON request body, raising InvalidRequest on error."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise InvalidRequest("Invalid request body length.") from error
        if length < 1 or length > MAX_REQUEST_SIZE:
            raise InvalidRequest("Request body must be between 1 byte and 16 KB.")
        try:
            return json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise InvalidRequest("Request body must contain valid JSON.") from error

    def serve_file(self, filename, content_type):
        """Serve a static file with the given filename and content type."""
        content = Path(__file__).with_name(filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):  # pylint: disable=invalid-name
        """Handle GET requests for web assets and tasks."""
        path = urlsplit(self.path).path
        if path in WEB_FILES:
            filename, content_type = WEB_FILES[path]
            try:
                self.serve_file(filename, content_type)
            except OSError:
                logging.exception("Unable to serve %s", filename)
                self.send_json(500, {"error": "The web app could not load a required file."})
            return

        if path == "/api/tasks":
            try:
                with TASKS_LOCK:
                    tasks = load_tasks()
                self.send_json(200, {"tasks": tasks})
            except (OSError, ValueError):
                logging.exception("Unable to load tasks")
                self.send_json(500, {"error": "Tasks could not be loaded. Check tasks.json."})
            return

        self.send_json(404, {"error": "Not found."})

    def do_POST(self) -> None:
        """Handle creation of a new task."""
        if urlsplit(self.path).path != "/api/tasks":
            self.send_json(404, {"error": "Not found."})
            return
        try:
            body = self.read_json()
            title = body.get("title") if isinstance(body, dict) else None
            priority = body.get("priority", "medium") if isinstance(body, dict) else None
            due_date = body.get("due_date", "") if isinstance(body, dict) else None
            if not isinstance(title, str) or not title.strip():
                raise InvalidRequest("A task description is required.")
            if len(title.strip()) > 500:
                raise InvalidRequest("Task descriptions must be 500 characters or fewer.")
            if not isinstance(priority, str) or priority not in PRIORITIES:
                raise InvalidRequest("Priority must be low, medium, or high.")
            if not is_valid_due_date(due_date):
                raise InvalidRequest("Due date must be a valid calendar date.")
            with TASKS_LOCK:
                tasks = load_tasks()
                task = {
                    "title": title.strip(),
                    "done": False,
                    "priority": priority,
                    "due_date": due_date,
                }
                tasks.append(task)
                save_tasks(tasks)
            self.send_json(201, {"task": task})
        except InvalidRequest as error:
            self.send_json(400, {"error": str(error)})
        except (OSError, ValueError):
            logging.exception("Unable to save new task")
            self.send_json(500, {"error": "The task could not be saved."})

    def do_PATCH(self):  # pylint: disable=invalid-name,too-many-branches
        """Handle partial updates to a task."""
        match = TASK_PATH.fullmatch(urlsplit(self.path).path)
        if match is None:
            self.send_json(404, {"error": "Not found."})
            return
        try:
            body = self.read_json()
            if not isinstance(body, dict) or not body:
                raise InvalidRequest("Provide task fields to update.")
            if set(body) - {"title", "done", "priority", "due_date"}:
                raise InvalidRequest("The request contains unsupported task fields.")
            updates = {}
            if "title" in body:
                title = body["title"]
                if not isinstance(title, str) or not title.strip():
                    raise InvalidRequest("A task description is required.")
                if len(title.strip()) > 500:
                    raise InvalidRequest("Task descriptions must be 500 characters or fewer.")
                updates["title"] = title.strip()
            if "done" in body:
                if not isinstance(body["done"], bool):
                    raise InvalidRequest("Completion state must be true or false.")
                updates["done"] = body["done"]
            if "priority" in body:
                priority = body["priority"]
                if not isinstance(priority, str) or priority not in PRIORITIES:
                    raise InvalidRequest("Priority must be low, medium, or high.")
                updates["priority"] = priority
            if "due_date" in body:
                due_date = body["due_date"]
                if not is_valid_due_date(due_date):
                    raise InvalidRequest("Due date must be a valid calendar date.")
                updates["due_date"] = due_date
            with TASKS_LOCK:
                tasks = load_tasks()
                index = int(match.group(1))
                if index >= len(tasks):
                    self.send_json(404, {"error": "Task not found."})
                    return
                tasks[index].update(updates)
                save_tasks(tasks)
                task = tasks[index]
            self.send_json(200, {"task": task})
        except InvalidRequest as error:
            self.send_json(400, {"error": str(error)})
        except (OSError, ValueError):
            logging.exception("Unable to update task")
            self.send_json(500, {"error": "The task could not be updated."})

    def do_DELETE(self):  # pylint: disable=invalid-name
        """Delete a task identified by the request path."""
        match = TASK_PATH.fullmatch(urlsplit(self.path).path)
        if match is None:
            self.send_json(404, {"error": "Not found."})
            return
        try:
            with TASKS_LOCK:
                tasks = load_tasks()
                index = int(match.group(1))
                if index >= len(tasks):
                    self.send_json(404, {"error": "Task not found."})
                    return
                task = tasks.pop(index)
                save_tasks(tasks)
            self.send_json(200, {"task": task})
        except (OSError, ValueError):
            logging.exception("Unable to delete task")
            self.send_json(500, {"error": "The task could not be deleted."})


def main():
    """Start the to-do manager web server."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    server = ThreadingHTTPServer(("127.0.0.1", 8000), TodoRequestHandler)
    print("To-do manager is running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down the to-do manager.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
