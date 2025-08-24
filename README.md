# Multi-LLM Collaboration System

Harness the collaborative power of GPT-5, Claude, Gemini, Groq, and more—structured as expert agents for deep, insightful discussions rather than adversarial debates.

> **Live Demo:** https://www.aidotcomtools.com/multillmcollaborationH/

---

## Table of Contents
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [How to Use](#how-to-use)
- [Project Status](#project-status)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features
- **Multi-Model Collaboration** – Seamlessly integrate GPT-5, Claude, Gemini, Groq, Mistral, DeepSeek, and more to orchestrate rich, complementary discussions.
- **Role Specialization** – Assign roles like Analyst, Researcher, or CEO to optimize each model's capabilities.
- **Round-Based Workflow** – Structured multi-round discussion flow for refined insights.
- **Intelligent Summarization** – Automatically generate summaries and final reports.
- **Bilingual Interface** – Supports both English and Chinese.
- **Export Options** – Downloadable outputs in TXT and DOC formats.
- **Minimalist UI** – Modern black-and-green flat design for intuitive interaction.

---

## Quick Start

### Prerequisites
- Node.js

### Setup
```bash
git clone <your-repo-url>
cd multi-llm-collaboration
npm install
```

### Configure API Keys
Add your `OPENAI_API_KEY` (and other provider keys if needed) to a `.env.local` file. Ensure `.env.local` is listed in `.gitignore` for security.

### Run Locally
```bash
npm run dev
```

### Build & Deploy
```bash
npm run build
npm run deploy
```

## Tech Stack
1. **Frontend:** React + TypeScript + Vite
2. **AI Models Integrated:** GPT-5, Claude, Gemini, Groq, Mistral, DeepSeek
3. **Styling:** Custom CSS, flat minimalist UI
4. **Hosting:** Google Cloud Platform or self-hosted environment

## How to Use
1. Choose one or more AI models and set up API keys.
2. Define the discussion topic.
3. Assign roles to each AI model.
4. Execute the discussion rounds.
5. Review outcomes and export the summary report.

## Project Status
Hackathon submission completed on 2025-01-24. Core features are stable and fully deployed.

## Contributing
Contributions are welcome! Feel free to submit a Pull Request for enhancements or bug fixes.

## License
Apache-2.0 License
