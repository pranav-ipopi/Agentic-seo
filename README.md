# Hermes - Agentic SEO Platform

## Problem Statement
Modern agencies execute SEO, content marketing, social media management, design, and client operations through fragmented tools, spreadsheets, manual processes, and disconnected teams. Valuable knowledge remains trapped inside individual employees, causing inconsistent execution, slow onboarding, limited scalability, poor visibility into work, and high operational costs.

Tasks such as backlink creation, content production, social publishing, reporting, and campaign management require repetitive manual effort that prevents agencies from scaling efficiently while maintaining quality.

## Mission
To build an AI-first operations platform that transforms agency execution by capturing knowledge, automating repetitive workflows, and enabling teams to deliver higher-quality outcomes with greater speed, consistency, and transparency.

## Vision
Hermes will become the operating system for modern digital agencies. Instead of managing work through scattered tools and spreadsheets, agencies will run SEO, content, social media, design, and future departments from a single intelligent platform powered by AI skills, workflows, and automation.

The long-term vision is to create a self-improving execution platform where every successful action becomes organizational knowledge. As Hermes learns from completed workflows, it continuously improves efficiency, reduces manual effort, and helps teams scale execution across thousands of tasks without proportionally increasing headcount.

## Strategic Objectives
1. Centralize agency operations
2. Build reusable AI skills and workflows
3. Automate SEO execution at scale
4. Enable multi-client, multi-team collaboration
5. Preserve organizational knowledge
6. Increase delivery speed and quality
7. Create a scalable foundation for future departments and services

## Architecture Overview
This repository contains the full Hermes platform which is built with:
- **Frontend**: A Next.js web application under the `agentic-seo` folder, utilizing modern React hooks and UI components for managing workflows, agent skills, task executions, and multi-department configurations.
- **Backend/Automation**: Python-based AI worker (`hermes_worker.py`) built to consume messages, execute atomic autonomous skills using AI, and return progress logs and results back to the system.
- **Database**: Supabase (PostgreSQL) is used as the backbone of Hermes, managing multi-tenant workspaces, RLS policies, logs, approvals, backlinks, and universal workflow tasks.

## Getting Started
Detailed documentation is available in the `agentic-seo/docs/` directory:
- [Architecture](agentic-seo/docs/architecture.md)
- [Database Schema](agentic-seo/docs/database_schema.md)
- [Departments Setup](agentic-seo/docs/departments_setup.md)