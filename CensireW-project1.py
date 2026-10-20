"""A simple command-line to-do list manager."""

import json
from pathlib import Path


TASKS_FILE = Path(__file__).with_name("tasks.json")


def load_tasks():
	"""Load saved tasks, or start with an empty list."""
	try:
		with TASKS_FILE.open("r", encoding="utf-8") as file:
			tasks = json.load(file)
		return tasks if isinstance(tasks, list) else []
	except (OSError, json.JSONDecodeError):
		return []


def save_tasks(tasks):
	"""Save tasks next to this script."""
	with TASKS_FILE.open("w", encoding="utf-8") as file:
		json.dump(tasks, file, indent=2)


def show_tasks(tasks):
	if not tasks:
		print("\nYour to-do list is empty.")
		return

	print("\nTo-do list:")
	for number, task in enumerate(tasks, start=1):
		status = "[x]" if task["done"] else "[ ]"
		print(f"{number}. {status} {task['title']}")


def read_task_number(tasks, action):
	if not tasks:
		print("There are no tasks to " + action + ".")
		return None
	try:
		number = int(input("Task number: "))
		if 1 <= number <= len(tasks):
			return number - 1
	except ValueError:
		pass
	print("Please enter a valid task number.")
	return None


def main():
	tasks = load_tasks()

	while True:
		print("\nTo-Do List Manager")
		print("1. View tasks")
		print("2. Add task")
		print("3. Mark task complete/incomplete")
		print("4. Delete task")
		print("5. Quit")
		choice = input("Choose an option: ").strip()

		if choice == "1":
			show_tasks(tasks)
		elif choice == "2":
			title = input("Task description: ").strip()
			if title:
				tasks.append({"title": title, "done": False})
				save_tasks(tasks)
				print("Task added.")
			else:
				print("Task description cannot be empty.")
		elif choice == "3":
			show_tasks(tasks)
			index = read_task_number(tasks, "update")
			if index is not None:
				tasks[index]["done"] = not tasks[index]["done"]
				save_tasks(tasks)
				print("Task status updated.")
		elif choice == "4":
			show_tasks(tasks)
			index = read_task_number(tasks, "delete")
			if index is not None:
				removed = tasks.pop(index)
				save_tasks(tasks)
				print(f"Deleted: {removed['title']}")
		elif choice == "5":
			print("Goodbye!")
			break
		else:
			print("Please choose an option from 1 to 5.")


if __name__ == "__main__":
	main()
