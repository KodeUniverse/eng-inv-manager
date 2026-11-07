# Data & AI Products Engineer: Parts Inventory Decision-Support App

## Overview

This brief mirrors the work: take a raw business dataset, make it trustworthy, and turn it into a small application that helps someone make informed decisions. We care more about sound judgment and working software than about polish or scope.

## The Scenario

You are supporting an aviation parts business. Its inventory manager works from a raw export of jet engine part records covering parts in inventory, parts that have been sold, and parts that have been scrapped, along with repair costs and sales prices. They want a lightweight tool to understand where value is being made or lost and what to do with the parts on hand.

## What to Build

Build a lite web application using Streamlit (Python) or React (with the backend of your choice) that runs locally with a single command. Use the dataset at `backend/data/data.csv`.

### Required

**Data layer.** Load the dataset and produce a clean version for the app to use. This is a raw export with data quality problems. Find them, decide how to handle each one, and document your reasoning. Leave the raw file unchanged and make the cleaning reproducible, so rerunning it on a new export just works.

**Scrap view.** Show how much is being scrapped and where, for example scrap share by Module and SubType and the most frequently scrapped parts. Define "scrap rate" explicitly and explain your choice.

**Repair economics view.** For sold parts, show sales price against repair cost and the resulting margin by Module and SubType, and surface parts with weak or negative margins.

**Inventory and sell-through view.** Show what is on hand (by Module, SubType, warehouse, and condition) and compare how long parts actually take to sell with the expected time to sell in the data.

**One decision-support feature of your choice.** Something that helps the inventory manager act, not just look: a repair-or-scrap flag, a slow-mover watchlist, or a ranked list of parts to review. Explain the logic behind it and its limits.

Each view can be simple: a chart, a table, and filters. The quality of the underlying logic matters more than visual design.

### Stretch (optional)

- A simple scrap-risk baseline or model
- Automated tests for the cleaning and calculation logic
- CSV export, or notes on how you would deploy the app for a team

## A Note on the Data

Not every question can be answered fully from this dataset, and some fields are populated only for certain record types. If you reach a limit, tell us what is missing and what you did instead.

## Guidelines

- **Tools:** Python and SQL for the data work; Streamlit or React for the app. Use any libraries you like.
- **AI tools:** AI coding assistants are permitted, but you are responsible for everything you submit, so be ready to explain any part of it, and tell us in your README how you used AI tools.

## Deliverables

- Code, in this repository, that runs with a single command.
- README (1–2 pages) covering setup and run instructions, the data issues you found and how you handled them, key assumptions and definitions, limitations and what you would do with more time, and how you used AI tools.
- Optional: a few screenshots of the app.

## Evaluation Criteria

- **Data handling (30%):** Did you find the real problems, make sensible and documented decisions, and avoid silently distorting the numbers?
- **Code structure and reliability (25%):** Is the code organized, reproducible, and easy to change?
- **Usefulness and insight (25%):** Would an inventory manager find the app and its decision-support feature useful, and are the definitions sound?
- **Communication and documentation (20%):** Can you explain what you built, what you assumed, and what you would do next?
