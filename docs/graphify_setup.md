# Graphify Setup & Usage Guide

## What is Graphify?
Graphify maps out our entire project—code, documentation, and architecture—into an interactive, queryable knowledge graph. This repository has been initialized with Graphify to improve both developer understanding and AI agent efficiency.

## Why is it Helpful?
- **Instant Architecture Context**: It provides a visual and queryable representation of how components (e.g., database tables, API routes, components) relate to each other.
- **AI Agent Optimization**: Instead of the AI blindly searching through hundreds of files, it queries the graph to instantly pinpoint relevant files. This avoids context window limits and drastically reduces hallucinations.
- **Discovering "God Nodes"**: It automatically identifies highly connected and critical components in the architecture that drive the core logic.

## How the Initial Setup Was Done
1. **Tool Installation**: We installed the Graphify CLI globally via `uv` (a fast Python package manager) and added it to our system `PATH`.
2. **Project Initialization**: We ran `graphify antigravity install --project` to generate the `.agents/rules/graphify.md` configuration file. This instructs the AI agent to always consult the graph before modifying the code.
3. **Graph Generation**: We built the initial graph using `graphify update .`, which parsed the Abstract Syntax Trees (AST) of the codebase and created the `graphify-out/` directory.
4. **Git Hooks**: We installed Git hooks using `graphify hook install` so the graph stays up to date.

## How to Use It

### For Developers
- **Explore the Graph visually**: Open `graphify-out/graph.html` in any web browser.
- **Read the High-Level Report**: Check out `graphify-out/GRAPH_REPORT.md` to see the most important nodes and relationships.
- **Query the Graph**: From your terminal, you can trace how features work. For example:
  ```bash
  graphify query "How does the authentication flow work?"
  ```

### Keeping It Updated
- **Automatic Updates**: The installed Git hooks (`post-commit` and `post-checkout`) will automatically update the graph when you switch branches or commit code.
- **Manual Updates**: If you want to force an update immediately after making code changes, run:
  ```bash
  graphify update .
  ```
- **Semantic Documentation Processing**: By default, `graphify update .` only updates the structure of code files (AST) and does not require an API key. If you want Graphify to semantically process Markdown docs, TXT files, or Images, ensure you have an LLM API key (like `GEMINI_API_KEY` or `OPENAI_API_KEY`) set in your `.env` file and run:
  ```bash
  graphify .
  ```

## AI Agent Integration
The AI coding assistant is configured to use this graph natively. It reads the instructions located in `.agents/rules/graphify.md` at the start of every session. This means whenever you ask the AI a question about the architecture or request a new feature, the agent will automatically run graph queries in the background to understand dependencies before it begins writing code.
