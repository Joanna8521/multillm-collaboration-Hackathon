/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// --- TYPES AND INTERFACES ---
interface Call {
  provider: string; model: string; role: string; prompt: string; timeout_sec: number;
}
interface RoundPlan {
  calls: Call[];
  stop_condition: "continue" | "consensus_formed" | "round_limit_reached" | "insufficient_information";
}
interface FinalReportData {
  consensus: string; bullet_summary: string[]; doc_outline: string[]; doc_body_blocks: { heading: string; content: string }[];
}
interface CoordinatorResponse {
  round_plan: RoundPlan; debate_summary: string; final_if_stopped?: FinalReportData;
}
interface ExecutionResult {
  provider: string;
  model: string;
  response: string;
}
interface RoundHistory {
  round: number; summary: string; plan: RoundPlan;
  execution_results?: ExecutionResult[];
  final_report?: FinalReportData;
}
interface Clarification {
  provider: string; model: string; original_role: string; clarified_tasks: string; thinking_style: string;
}
interface ClarificationResponse {
  clarifications: Clarification[];
}

type AppStep = 'CONFIG' | 'SCOPING' | 'CLARIFICATION' | 'DISCUSSION';
type LoadingAction = 'clarify' | 'process' | 'execute' | 'stop' | 'continue' | null;
type SelectedModels = Record<string, string[]>;
type ModelRoles = Record<string, Record<string, string>>;
type ClarifiedRoles = Record<string, { clarified_tasks: string; thinking_style: string }>;
type Language = 'en' | 'zh';

// --- CONSTANTS ---
const AVAILABLE_MODELS = {
    "Google": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "OpenAI": ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
    "Anthropic": ["claude-3-5-sonnet", "claude-3-opus", "claude-3-haiku"],
    "Groq": ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma-7b-it", "gemma2-9b-it"],
    "Mistral": ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x7b", "open-mistral-7b", "codestral-latest"],
    "DeepSeek": ["deepseek-chat", "deepseek-coder"],
    "OpenEvidence": ["open-evidence-v1"],
};

const MODEL_CAPABILITIES = {
  en: {
    "Google": "Advanced reasoning, multimodal analysis, code generation",
    "OpenAI": "General intelligence, creative writing, complex problem solving",
    "Anthropic": "Safety-focused, analytical thinking, ethical reasoning",
    "Groq": "Fast inference, efficient processing, lightweight tasks",
    "Mistral": "Multilingual, code-focused, European AI perspective",
    "DeepSeek": "Mathematical reasoning, coding expertise, research-oriented",
    "OpenEvidence": "Evidence-based analysis, scientific reasoning"
  },
  zh: {
    "Google": "進階推理、多模態分析、程式碼生成",
    "OpenAI": "通用智能、創意寫作、複雜問題解決",
    "Anthropic": "安全導向、分析思維、倫理推理",
    "Groq": "快速推理、高效處理、輕量任務",
    "Mistral": "多語言、程式導向、歐洲AI視角",
    "DeepSeek": "數學推理、編程專長、研究導向",
    "OpenEvidence": "證據分析、科學推理"
  }
};

const COLLABORATION_TEMPLATES = {
  en: {
    "Business Strategy": {
      topic: "Comprehensive business strategy analysis and market positioning",
      roles: { "Google": "Business Strategy Consultant", "OpenAI": "Financial Analyst", "Anthropic": "Marketing Director", "Groq": "Operations Manager" }
    },
    "Technical Architecture": {
      topic: "System architecture design and technical implementation strategy",
      roles: { "Google": "Solutions Architect", "DeepSeek": "DevOps Engineer", "OpenAI": "Security Engineer", "Anthropic": "Performance Engineer" }
    },
    "Medical Research": {
      topic: "Clinical research methodology and medical innovation analysis",
      roles: { "OpenAI": "Clinical Researcher", "Anthropic": "Biostatistician", "OpenEvidence": "Medical Ethics Specialist", "Google": "Regulatory Affairs Expert" }
    },
    "Product Innovation": {
      topic: "Product development strategy and innovation methodology",
      roles: { "OpenAI": "Product Manager", "Google": "UX Designer", "Anthropic": "Innovation Strategist", "Groq": "Market Research Analyst" }
    },
    "Investment Analysis": {
      topic: "Investment opportunity evaluation and portfolio strategy",
      roles: { "OpenAI": "Investment Analyst", "Google": "Portfolio Manager", "Anthropic": "Risk Management Specialist", "Groq": "Market Economist" }
    },
    "Education Technology": {
      topic: "Educational technology innovation and learning methodology",
      roles: { "Google": "Educational Technologist", "OpenAI": "Learning Experience Designer", "Anthropic": "Data Analytics Specialist", "Groq": "Accessibility Expert" }
    },
    "Security Assessment": {
      topic: "Cybersecurity risk assessment and protection strategy",
      roles: { "Google": "Security Architect", "OpenAI": "Penetration Tester", "Anthropic": "Compliance Officer", "Groq": "Incident Response Specialist" }
    },
    "Code Architecture Review": {
      topic: "Code quality assessment and architectural review",
      roles: { "DeepSeek": "Senior Software Architect", "Google": "Code Quality Specialist", "OpenAI": "Performance Engineer", "Anthropic": "Security Code Reviewer" },
      isCodeMode: true
    }
  },
  zh: {
    "商業策略": {
      topic: "全面商業策略分析與市場定位",
      roles: { "Google": "商業策略顧問", "OpenAI": "財務分析師", "Anthropic": "行銷總監", "Groq": "營運經理" }
    },
    "技術架構": {
      topic: "系統架構設計與技術實施策略",
      roles: { "Google": "解決方案架構師", "DeepSeek": "DevOps工程師", "OpenAI": "資安工程師", "Anthropic": "效能工程師" }
    },
    "醫學研究": {
      topic: "臨床研究方法與醫學創新分析",
      roles: { "OpenAI": "臨床研究員", "Anthropic": "生物統計學家", "OpenEvidence": "醫學倫理專家", "Google": "法規事務專家" }
    },
    "產品創新": {
      topic: "產品開發策略與創新方法",
      roles: { "OpenAI": "產品經理", "Google": "UX設計師", "Anthropic": "創新策略師", "Groq": "市場研究分析師" }
    },
    "投資分析": {
      topic: "投資機會評估與投資組合策略",
      roles: { "OpenAI": "投資分析師", "Google": "投資組合經理", "Anthropic": "風險管理專家", "Groq": "市場經濟學家" }
    },
    "教育科技": {
      topic: "教育科技創新與學習方法",
      roles: { "Google": "教育技術專家", "OpenAI": "學習體驗設計師", "Anthropic": "數據分析專家", "Groq": "無障礙專家" }
    },
    "資安評估": {
      topic: "網路安全風險評估與防護策略",
      roles: { "Google": "資安架構師", "OpenAI": "滲透測試專家", "Anthropic": "合規官", "Groq": "事件回應專家" }
    },
    "程式架構審查": {
      topic: "程式碼品質評估與架構審查",
      roles: { "DeepSeek": "資深軟體架構師", "Google": "程式品質專家", "OpenAI": "效能工程師", "Anthropic": "安全程式審查員" },
      isCodeMode: true
    }
  }
};

const DISCUSSION_STYLES = {
  en: {
    "Professional": "formal, structured, business-oriented tone",
    "Casual": "relaxed, conversational, friendly tone",
    "Academic": "scholarly, research-focused, evidence-based tone",
    "Creative": "innovative, open-minded, brainstorming tone"
  },
  zh: {
    "專業": "正式、結構化、商業導向的語調",
    "輕鬆": "放鬆、對話式、友善的語調",
    "學術": "學術性、研究導向、基於證據的語調",
    "創意": "創新、開放思維、腦力激盪的語調"
  }
};

const UI_TEXT = {
  en: {
    title: "Multi-LLM Collaboration",
    description: "Harness the unique strengths of multiple AI models for collaborative discussion and innovative insights.",
    steps: { CONFIG: "1. Setup", SCOPING: "2. Topic", CLARIFICATION: "3. Roles", DISCUSSION: "4. Results" },
    topicPlaceholder: "Enter the main topic for discussion...",
    codeDebugMode: "Code Debug Mode",
    codeInput: "Paste your code here",
    codePlaceholder: "Paste your code that needs debugging or review...",
    errorDescription: "Describe the issue (optional)",
    errorPlaceholder: "What error are you getting? What's not working as expected?...",
    useTemplate: "Use Template",
    discussionTemplates: "Collaboration Templates",
    discussionStyle: "Discussion Style",
    customTopic: "Custom Topic",
    uploadFiles: "Upload Files",
    addUrls: "Add URLs",
    urlPlaceholder: "Enter URL to analyze...",
    addUrl: "Add URL",
    removeFile: "Remove",
    removeUrl: "Remove",
    assignCompanyRole: "Assign Company Roles",
    assignRolePlaceholder: "e.g., CEO, Lead Engineer, Marketing...",
    clarifyRoles: "Clarify Roles",
    editClarifiedRoles: "Edit & Confirm AI Roles",
    clarifiedTasks: "Clarified Tasks",
    thinkingStyle: "Thinking Style",
    selectModels: "Select Models for Discussion",
    modelCapabilities: "Model Capabilities",
    apiKeysTitle: "API Keys",
    apiKeysHelper: "Your keys are saved securely in your browser's local storage.",
    apiKeyPlaceholder: (provider: string) => `${provider} API Key`,
    next: "Next",
    back: "Back",
    startDiscussion: "Start Discussion",
    proceedToRound: (round: number) => `Proceed to Round ${round}`,
    startNewDiscussion: "Start New Discussion",
    errorOccurred: "An error occurred. Please check the console. Note: Direct browser API calls may be blocked by CORS.",
    topicRequired: "Please enter a topic.",
    rolesRequired: "Please assign a role to each selected model.",
    googleApiKeyRequired: "Google API Key is required.",
    round: "Round", discussionSummary: "Discussion Summary", roundPlan: "Round Plan",
    finalReport: "Final Report", consensus: "Consensus", keyPoints: "Key Points", documentOutline: "Document Outline", stopReason: "Reason for Stopping",
    executeTasks: "Execute Tasks for this Round",
    executionResults: "Execution Results",
    downloadTranscript: "Download Transcript (.txt)",
    downloadDoc: "Download Doc (.doc)",
    downloadCode: "Download Code (.js)",
    stopAndSummarize: "Stop & Summarize",
    askFollowUp: "Ask Follow-up Questions",
    submitFollowUp: "Submit & Continue Discussion",
    followUpPlaceholder: "Enter your follow-up questions here based on the final report...",
    discussionHistory: "Discussion History",
    loadDiscussion: "Load",
    deleteDiscussion: "Delete",
    noSavedDiscussions: "No saved discussions yet",
    saveDiscussion: "Save Discussion",
    closeHistory: "Close",
    confirmDelete: "Are you sure you want to delete this discussion?",
    discussionSaved: "History Saved",
    searchPlaceholder: "Search discussions...",
    noSearchResults: "There is no discussion history related to this keyword",
    stopConditions: {
      consensus_formed: "Consensus Formed",
      round_limit_reached: "Round Limit Reached",
      insufficient_information: "Insufficient Information to Proceed",
      continue: "In Progress",
    }
  },
  zh: {
    title: "Multi-LLM Collaboration",
    description: "整合多個AI模型的專業優勢，進行深度協作討論與創新發想。",
    steps: { CONFIG: "1. 設定", SCOPING: "2. 主題", CLARIFICATION: "3. 角色", DISCUSSION: "4. 結果" },
    topicPlaceholder: "輸入要討論的主題...",
    codeDebugMode: "程式碼除錯模式",
    codeInput: "貼上您的程式碼",
    codePlaceholder: "貼上需要除錯或審查的程式碼...",
    errorDescription: "描述問題（可選）",
    errorPlaceholder: "您遇到什麼錯誤？哪裡運作不如預期？...",
    useTemplate: "使用模板",
    discussionTemplates: "協作模板",
    discussionStyle: "討論風格",
    customTopic: "自訂主題",
    uploadFiles: "上傳檔案",
    addUrls: "新增網址",
    urlPlaceholder: "輸入要分析的網址...",
    addUrl: "新增網址",
    removeFile: "移除",
    removeUrl: "移除",
    assignCompanyRole: "指派公司角色",
    assignRolePlaceholder: "例如：CEO、首席工程師、行銷總監...",
    clarifyRoles: "釐清角色任務",
    editClarifiedRoles: "編輯並確認 AI 角色",
    clarifiedTasks: "具體任務",
    thinkingStyle: "思考方式",
    selectModels: "選擇參與討論的模型",
    modelCapabilities: "模型能力說明",
    apiKeysTitle: "API 金鑰",
    apiKeysHelper: "您的金鑰會安全地儲存在瀏覽器的本機儲存空間中。",
    apiKeyPlaceholder: (provider: string) => `${provider} API 金鑰`,
    next: "下一步",
    back: "上一步",
    startDiscussion: "開始討論",
    proceedToRound: (round: number) => `進入第 ${round} 回合`,
    startNewDiscussion: "開始新的討論",
    errorOccurred: "發生錯誤，請查看主控台。注意：從瀏覽器直接呼叫 API 可能會被 CORS 安全策略阻擋。",
    topicRequired: "請輸入一個主題。",
    rolesRequired: "請為每個選擇的模型指派一個角色。",
    googleApiKeyRequired: "必須提供 Google API 金鑰。",
    round: "回合", discussionSummary: "討論摘要", roundPlan: "回合計畫",
    finalReport: "最終報告", consensus: "共識結論", keyPoints: "重點摘要", documentOutline: "文件大綱", stopReason: "討論停止原因",
    executeTasks: "執行本回合任務",
    executionResults: "執行結果",
    downloadTranscript: "下載完整對話紀錄 (.txt)",
    downloadDoc: "下載文件 (.doc)",
    downloadCode: "下載程式碼 (.js)",
    stopAndSummarize: "停止並總結",
    askFollowUp: "提出更多問題",
    submitFollowUp: "提交並繼續討論",
    followUpPlaceholder: "根據最終報告，在此輸入您想追問的問題...",
    discussionHistory: "討論歷史",
    loadDiscussion: "載入",
    deleteDiscussion: "刪除",
    noSavedDiscussions: "尚無儲存的討論",
    saveDiscussion: "儲存討論",
    closeHistory: "關閉",
    confirmDelete: "確定要刪除這個討論嗎？",
    discussionSaved: "歷史已儲存",
    searchPlaceholder: "搜尋討論...",
    noSearchResults: "沒有與此關鍵字相關的討論歷史",
    stopConditions: {
      consensus_formed: "已達成共識",
      round_limit_reached: "已達回合上限",
      insufficient_information: "資訊不足無法繼續",
      continue: "進行中",
    }
  }
};

const API_KEY_STORAGE_ID = 'shadow-clone-api-keys';
const DISCUSSION_HISTORY_STORAGE_ID = 'multillm-discussion-history';

interface SavedDiscussion {
  id: string;
  title: string;
  timestamp: number;
  topic: string;
  selectedModels: SelectedModels;
  modelRoles: ModelRoles;
  clarifiedRoles: ClarifiedRoles;
  history: RoundHistory[];
  isFinished: boolean;
  isCodeMode: boolean;
  language: Language;
}

const InlineLoader = () => <div className="inline-loader"></div>;

/**
 * Aggressively strips markdown and formats text into a clean, readable format.
 * Ensures bullet points are properly formatted on new lines.
 * @param text The raw AI-generated text.
 * @returns Cleaned, plain text.
 */
const formatAIResponse = (text: string | undefined | null): string => {
    if (!text) return '';
    return text
        // Remove bold and italics
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        // Remove markdown headers
        .replace(/^#+\s/gm, '')
        // Ensure bullet points are on new lines
        .replace(/\s*-\s/g, '\n- ')
        // Add double line breaks for paragraph separation
        .replace(/\n\n+/g, '\n\n')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n\n');
};


// --- MAIN APP COMPONENT ---
const App = () => {
  // Core State
  const [appStep, setAppStep] = useState<AppStep>('CONFIG');
  const [topic, setTopic] = useState("");
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RoundHistory[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [language, setLanguage] = useState<Language>('en');

  // Step States
  const [selectedModels, setSelectedModels] = useState<SelectedModels>({ "Google": ["gemini-2.5-pro"] });
  const [modelRoles, setModelRoles] = useState<ModelRoles>({});
  const [clarifiedRoles, setClarifiedRoles] = useState<ClarifiedRoles>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(API_KEY_STORAGE_ID) || '{}');
    } catch (e) { return {}; }
  });
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [errorDescription, setErrorDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [discussionStyle, setDiscussionStyle] = useState("Professional");
  const [savedDiscussions, setSavedDiscussions] = useState<SavedDiscussion[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISCUSSION_HISTORY_STORAGE_ID) || '[]');
    } catch (e) { return []; }
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isDiscussionSaved, setIsDiscussionSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const resultsEndRef = useRef<HTMLDivElement>(null);
  const t = UI_TEXT[language];
  const flatSelectedModels = Object.entries(selectedModels).flatMap(([p, m]) => m.map(model => ({ provider: p, model })));

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE_ID, JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem(DISCUSSION_HISTORY_STORAGE_ID, JSON.stringify(savedDiscussions));
  }, [savedDiscussions]);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // --- API Schemas ---
  const clarificationSchema = {
    type: Type.OBJECT,
    properties: {
      clarifications: { type: Type.ARRAY, items: {
          type: Type.OBJECT,
          properties: {
            provider: { type: Type.STRING },
            model: { type: Type.STRING },
            original_role: { type: Type.STRING },
            clarified_tasks: { type: Type.STRING, description: "A list of specific tasks for this role, with each task starting on a new line. Use hyphens for bullet points." },
            thinking_style: { type: Type.STRING, description: "The suggested mindset or approach for this role." },
          },
          required: ["provider", "model", "original_role", "clarified_tasks", "thinking_style"],
        }
      }
    },
    required: ["clarifications"]
  };

  const coordinatorSchema = {
    type: Type.OBJECT, properties: {
      round_plan: { type: Type.OBJECT, properties: {
          calls: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                provider: { type: Type.STRING }, model: { type: Type.STRING },
                role: { type: Type.STRING }, prompt: { type: Type.STRING },
                timeout_sec: { type: Type.INTEGER },
              }, required: ["provider", "model", "role", "prompt", "timeout_sec"],
            },
          },
          stop_condition: { type: Type.STRING, enum: ["continue", "consensus_formed", "round_limit_reached", "insufficient_information"] },
        }, required: ["calls", "stop_condition"],
      },
      debate_summary: { type: Type.STRING },
      final_if_stopped: { type: Type.OBJECT, nullable: true, properties: {
          consensus: { type: Type.STRING },
          bullet_summary: { type: Type.ARRAY, items: { type: Type.STRING } },
          doc_outline: { type: Type.ARRAY, items: { type: Type.STRING } },
          doc_body_blocks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                heading: { type: Type.STRING }, content: { type: Type.STRING },
              }, required: ["heading", "content"],
            },
          },
        },
      },
    }, required: ["round_plan", "debate_summary"],
  };

  const getGoogleAI = () => {
    const googleApiKey = apiKeys['Google'];
    if (!googleApiKey) {
      setError(t.googleApiKeyRequired);
      return null;
    }
    return new GoogleGenAI({ apiKey: googleApiKey });
  }

  // --- API Handlers ---
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleClarifyRoles = async () => {
    if (!isCodeMode && !topic.trim()) { setError(t.topicRequired); return; }
    if (isCodeMode && !codeInput.trim()) { setError('Please paste your code'); return; }
    if (flatSelectedModels.some(({provider, model}) => !modelRoles[provider]?.[model])) {
        setError(t.rolesRequired);
        return;
    }
    
    setLoadingAction('clarify'); setError(null);
    const ai = getGoogleAI();
    if (!ai) { setLoadingAction(null); return; }

    const systemInstruction = `You are a "Project Manager" AI. Your job is to take a user's ${isCodeMode ? 'code debugging request' : 'topic'}, any uploaded files or URLs, and a list of high-level company roles for different AI models. Your task is to break down each role into a concrete, actionable plan considering the provided materials. For each model, define its specific tasks (as a bulleted list, with each task starting on a new line with a hyphen) and a recommended thinking style to best contribute to the ${isCodeMode ? 'code analysis and debugging' : 'discussion on the given topic'}. Respond ONLY with a JSON object adhering to the schema. CRITICAL: ALL text content in the JSON response (clarified_tasks and thinking_style fields) MUST be written in ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'}. Do not mix languages.`;

    let userPrompt = isCodeMode ? 
      `Code Debug Session\n\nCode to analyze:\n\`\`\`\n${codeInput}\n\`\`\`\n\n${errorDescription ? `Issue description: ${errorDescription}\n\n` : ''}` :
      `Topic: "${topic}"\n\n`;
    
    if (uploadedFiles.length > 0) {
      userPrompt += `Uploaded Files:\n`;
      try {
        for (const file of uploadedFiles) {
          const content = await readFileContent(file);
          userPrompt += `\n--- File: ${file.name} ---\n${content}\n`;
        }
      } catch (error) {
        console.error('Error reading file:', error);
        setError('Error reading uploaded files');
        setLoadingAction(null);
        return;
      }
      userPrompt += `\n`;
    }
    
    if (urls.length > 0) {
      userPrompt += `URLs to analyze:\n`;
      urls.forEach(url => {
        userPrompt += `- ${url}\n`;
      });
      userPrompt += `\n`;
    }
    
    userPrompt += `Roles:\n`;
    flatSelectedModels.forEach(({ provider, model }) => {
      userPrompt += `- ${provider}/${model}: ${modelRoles[provider]?.[model]}\n`;
    });

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseSchema: clarificationSchema }
      });

      const parsed: ClarificationResponse = JSON.parse(response.text.trim());
      const newClarifiedRoles: ClarifiedRoles = {};
      parsed.clarifications.forEach(c => {
        newClarifiedRoles[`${c.provider}/${c.model}`] = {
          clarified_tasks: formatAIResponse(c.clarified_tasks),
          thinking_style: formatAIResponse(c.thinking_style),
        };
      });
      setClarifiedRoles(newClarifiedRoles);
      setAppStep('CLARIFICATION');
    } catch (e) {
      console.error(e); setError(t.errorOccurred);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleProcessRound = async (followUpQuestion?: string) => {
    setLoadingAction(followUpQuestion ? 'continue' : 'process'); 
    setError(null);
    const ai = getGoogleAI();
    if (!ai) { setLoadingAction(null); return; }

    const systemInstruction = `You are a world-class "Coordinator" for a multi-LLM discussion. Your sole purpose is to manage a round-based collaboration to explore a user's topic. Analyze the history and the results of the previous round's execution. Based on this, plan the next round by creating diverse, parallel tasks for each model that respect their defined roles. Summarize progress, decide if the discussion should continue, and generate a final report if it stops. 

CRITICAL LANGUAGE REQUIREMENT: Regardless of what language the user's topic or input is written in, you MUST respond ONLY in ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'}. Do not match the user's input language - always use ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'} for ALL text fields in your JSON response.

FORMATTING REQUIREMENT: For better readability, you may use:
- Numbers for lists (1. 2. 3.)
- Capital letters for emphasis instead of **bold**
- Line breaks to separate sections
- Simple text formatting like "SECTION:" for headers
Do NOT use Markdown syntax like **, *, #, etc.

Respond ONLY with a JSON object adhering to the provided schema.`;

    let userPrompt = `Topic: "${topic}"\n\n`;
    
    if (uploadedFiles.length > 0) {
      userPrompt += `Uploaded Files:\n`;
      try {
        for (const file of uploadedFiles) {
          const content = await readFileContent(file);
          userPrompt += `\n--- File: ${file.name} ---\n${content}\n`;
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
      userPrompt += `\n`;
    }
    
    if (urls.length > 0) {
      userPrompt += `URLs to analyze:\n`;
      urls.forEach(url => {
        userPrompt += `- ${url}\n`;
      });
      userPrompt += `\n`;
    }
    
    userPrompt += `Participants and their detailed roles:\n`;
    flatSelectedModels.forEach(({ provider, model }) => {
        const key = `${provider}/${model}`;
        const initialRole = modelRoles[provider]?.[model] || '';
        const clarification = clarifiedRoles[key];
        userPrompt += `- ${key} (Role: ${initialRole})\n`;
        if (clarification) {
            userPrompt += `  Tasks: ${clarification.clarified_tasks}\n  Thinking Style: ${clarification.thinking_style}\n`;
        }
    });

    if (history.length > 0) {
        userPrompt += "\nDiscussion History:\n";
        history.forEach(h => {
            userPrompt += `--- Round ${h.round} Summary ---\n${h.summary}\n`;
            if (h.execution_results) {
                userPrompt += `\n--- Round ${h.round} Execution Results ---\n`;
                h.execution_results.forEach(res => {
                    userPrompt += `[${res.provider}/${res.model} RESPONSE]:\n${res.response}\n\n`;
                });
            }
        });
    }
    
    if (followUpQuestion) {
        const finalReport = history[history.length - 1]?.final_report;
        userPrompt += `\n--- PREVIOUS FINAL REPORT ---\nConsensus: ${finalReport?.consensus}\nKey Points: ${finalReport?.bullet_summary.join(', ')}\n\n`;
        userPrompt += `The user has reviewed the final report and has a follow-up question: "${followUpQuestion}". Please generate a new plan to address this question and continue the discussion.`;
    } else if (history.length > 0) {
        userPrompt += `\nBased on the latest results, generate the plan for Round ${history.length + 1}.`;
    } else {
        userPrompt += "\nThis is the first round. Generate the initial plan.";
    }


    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseSchema: coordinatorSchema }
      });
      const parsed: CoordinatorResponse = JSON.parse(response.text.trim());
      
      // Clean all AI-generated text fields
      const cleanedFinalReport = parsed.final_if_stopped ? {
        ...parsed.final_if_stopped,
        consensus: formatAIResponse(parsed.final_if_stopped.consensus),
        bullet_summary: parsed.final_if_stopped.bullet_summary.map(formatAIResponse),
        doc_body_blocks: parsed.final_if_stopped.doc_body_blocks.map(block => ({
            heading: formatAIResponse(block.heading),
            content: formatAIResponse(block.content),
        })),
      } : undefined;

      const newHistoryItem: RoundHistory = {
        round: history.length + 1,
        summary: formatAIResponse(parsed.debate_summary),
        plan: parsed.round_plan,
        final_report: cleanedFinalReport,
      };
      if (parsed.round_plan.stop_condition !== "continue") setIsFinished(true);
      setHistory([...history, newHistoryItem]);
      setAppStep('DISCUSSION');
    } catch (e) {
      console.error(e); setError(t.errorOccurred);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleExecuteRound = async () => {
    setLoadingAction('execute');
    setError(null);

    const latestRound = history[history.length - 1];
    if (!latestRound) {
        setError("No round to execute.");
        setLoadingAction(null);
        return;
    }

    const executeCall = async (call: Call): Promise<ExecutionResult> => {
        const apiKey = apiKeys[call.provider];
        if (!apiKey) {
            throw new Error(`API Key for ${call.provider} is missing.`);
        }

        try {
            let responseText: string;
            const systemInstruction = `Your role is: ${call.role}.
Your entire response MUST be in plain text.
ABSOLUTELY DO NOT use any Markdown formatting. This means no **bold text**, no *italic text*, no lists using - or *, and no # headers.
The response language must be ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'}.`;

            switch (call.provider) {
                case 'Google':
                    const ai = new GoogleGenAI({ apiKey });
                    const response = await ai.models.generateContent({
                        model: call.model,
                        contents: call.prompt,
                        config: { systemInstruction }
                    });
                    responseText = response.text;
                    break;
                
                case 'Anthropic':
                    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: call.model,
                            system: systemInstruction,
                            messages: [{ role: 'user', content: call.prompt }],
                            max_tokens: 4096,
                        })
                    });
                     if (!anthropicRes.ok) {
                        const errorBody = await anthropicRes.text();
                        throw new Error(`Anthropic API error: ${anthropicRes.status} ${anthropicRes.statusText} - ${errorBody}`);
                    }
                    const anthropicData = await anthropicRes.json();
                    responseText = anthropicData.content?.[0]?.text || '';
                    break;

                case 'OpenAI':
                case 'Groq':
                case 'Mistral':
                case 'DeepSeek':
                case 'OpenEvidence':
                    const endpoints: Record<string, string> = {
                        OpenAI: 'https://api.openai.com/v1/chat/completions',
                        Groq: 'https://api.groq.com/openai/v1/chat/completions',
                        Mistral: 'https://api.mistral.ai/v1/chat/completions',
                        DeepSeek: 'https://api.deepseek.com/chat/completions',
                        OpenEvidence: 'https://api.openevidence.com/v1/chat/completions',
                    };
                    const openAIRes = await fetch(endpoints[call.provider], {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: call.model,
                            messages: [
                                { role: 'system', content: systemInstruction },
                                { role: 'user', content: call.prompt }
                            ]
                        })
                    });
                     if (!openAIRes.ok) {
                        const errorBody = await openAIRes.text();
                        throw new Error(`${call.provider} API error: ${openAIRes.status} ${openAIRes.statusText} - ${errorBody}`);
                    }
                    const openAIData = await openAIRes.json();
                    responseText = openAIData.choices?.[0]?.message?.content || '';
                    break;

                default:
                    throw new Error(`Unsupported provider: ${call.provider}`);
            }

            return { provider: call.provider, model: call.model, response: formatAIResponse(responseText) };

        } catch (e: any) {
            console.error(`Execution failed for ${call.provider}/${call.model}:`, e);
            const detailedError = e.response ? await e.response.text() : e.message;
            return {
                provider: call.provider,
                model: call.model,
                response: `Error: ${detailedError || 'Failed to get response.'}`
            };
        }
    };
    
    try {
        const executionPromises = latestRound.plan.calls.map(executeCall);
        const results = await Promise.all(executionPromises);
        setHistory(prevHistory => {
            const newHistory = [...prevHistory];
            newHistory[newHistory.length - 1].execution_results = results;
            return newHistory;
        });
    } catch (e) {
        console.error(e);
        setError(t.errorOccurred);
    } finally {
        setLoadingAction(null);
    }
  };

  const handleStopDiscussion = async () => {
    setLoadingAction('stop'); setError(null);
    const ai = getGoogleAI();
    if (!ai) { setLoadingAction(null); return; }

    const systemInstruction = `You are a world-class "Coordinator" for a multi-LLM discussion. The user has requested to STOP the discussion. Your task is to analyze the entire discussion history and generate a definitive final report. You MUST populate the "final_if_stopped" field and set "stop_condition" to "consensus_formed". 

CRITICAL LANGUAGE REQUIREMENT: Regardless of what language the user's topic or previous responses were in, you MUST respond ONLY in ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'}. Do not match the input language - always use ${language === 'zh' ? 'Traditional Chinese (繁體中文)' : 'English'} for ALL text fields in your JSON response.

FORMATTING REQUIREMENT: For better readability, you may use:
- Numbers for lists (1. 2. 3.)
- Capital letters for emphasis instead of **bold**
- Line breaks to separate sections
- Simple text formatting like "SECTION:" for headers
Do NOT use Markdown syntax like **, *, #, etc.

Respond ONLY with a JSON object adhering to the provided schema.`;

    let userPrompt = `Topic: "${topic}"\n\n`;
    
    if (uploadedFiles.length > 0) {
      userPrompt += `Uploaded Files:\n`;
      try {
        for (const file of uploadedFiles) {
          const content = await readFileContent(file);
          userPrompt += `\n--- File: ${file.name} ---\n${content}\n`;
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
      userPrompt += `\n`;
    }
    
    if (urls.length > 0) {
      userPrompt += `URLs to analyze:\n`;
      urls.forEach(url => {
        userPrompt += `- ${url}\n`;
      });
      userPrompt += `\n`;
    }
    
    userPrompt += `Participants and their detailed roles:\n`;
    flatSelectedModels.forEach(({ provider, model }) => {
        const key = `${provider}/${model}`;
        const initialRole = modelRoles[provider]?.[model] || '';
        const clarification = clarifiedRoles[key];
        userPrompt += `- ${key} (Role: ${initialRole})\n`;
        if (clarification) {
            userPrompt += `  Tasks: ${clarification.clarified_tasks}\n  Thinking Style: ${clarification.thinking_style}\n`;
        }
    });

    userPrompt += "\nDiscussion History:\n";
    history.forEach(h => {
        userPrompt += `--- Round ${h.round} Summary ---\n${h.summary}\n`;
        if (h.execution_results) {
            userPrompt += `\n--- Round ${h.round} Execution Results ---\n`;
            h.execution_results.forEach(res => {
                userPrompt += `[${res.provider}/${res.model} RESPONSE]:\n${res.response}\n\n`;
            });
        }
    });
    userPrompt += `\nThe user has decided to stop the discussion. Please analyze all the information above and generate the final report.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', contents: userPrompt,
            config: { systemInstruction, responseMimeType: 'application/json', responseSchema: coordinatorSchema }
        });
        const parsed: CoordinatorResponse = JSON.parse(response.text.trim());
        
        const cleanedFinalReport = parsed.final_if_stopped ? {
          ...parsed.final_if_stopped,
          consensus: formatAIResponse(parsed.final_if_stopped.consensus),
          bullet_summary: parsed.final_if_stopped.bullet_summary.map(formatAIResponse),
          doc_body_blocks: parsed.final_if_stopped.doc_body_blocks.map(block => ({
              heading: formatAIResponse(block.heading),
              content: formatAIResponse(block.content),
          })),
        } : undefined;

        setHistory(prevHistory => {
            const newHistory = [...prevHistory];
            const lastItem = newHistory[newHistory.length - 1];
            if (lastItem) {
                lastItem.final_report = cleanedFinalReport;
                lastItem.plan.stop_condition = parsed.round_plan.stop_condition || 'consensus_formed';
            }
            return newHistory;
        });

        setIsFinished(true);
    } catch (e) {
      console.error(e); setError(t.errorOccurred);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleContinueWithFollowUp = () => {
    if (!followUpQuestion.trim()) return;
    setIsFinished(false);
    setIsAskingFollowUp(false);
    handleProcessRound(followUpQuestion);
    setFollowUpQuestion("");
  };

  const saveCurrentDiscussion = () => {
    if (!topic.trim() || history.length === 0) return;
    
    const discussionTitle = topic.length > 50 ? topic.substring(0, 50) + '...' : topic;
    const newDiscussion: SavedDiscussion = {
      id: Date.now().toString(),
      title: discussionTitle,
      timestamp: Date.now(),
      topic,
      selectedModels,
      modelRoles,
      clarifiedRoles,
      history,
      isFinished,
      isCodeMode,
      language
    };
    
    setSavedDiscussions(prev => [newDiscussion, ...prev.slice(0, 19)]); // 保留最新20個討論
    setIsDiscussionSaved(true);
    setSaveMessage(t.discussionSaved);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const loadDiscussion = (discussion: SavedDiscussion) => {
    setTopic(discussion.topic);
    setSelectedModels(discussion.selectedModels);
    setModelRoles(discussion.modelRoles);
    setClarifiedRoles(discussion.clarifiedRoles);
    setHistory(discussion.history);
    setIsFinished(discussion.isFinished);
    setIsCodeMode(discussion.isCodeMode);
    setLanguage(discussion.language);
    setAppStep('DISCUSSION');
    setShowHistoryModal(false);
  };

  const deleteDiscussion = (id: string) => {
    setSavedDiscussions(prev => prev.filter(d => d.id !== id));
  };

  const startNewDiscussion = () => {
      setTopic(""); setHistory([]); setIsFinished(false); setError(null);
      setSelectedModels({ "Google": ["gemini-2.5-pro"] });
      setModelRoles({}); setClarifiedRoles({}); setAppStep('CONFIG');
      setIsAskingFollowUp(false); setFollowUpQuestion("");
      setUploadedFiles([]); setUrls([]); setNewUrl("");
      setIsCodeMode(false); setCodeInput(""); setErrorDescription("");
      setSelectedTemplate(null); setDiscussionStyle("Professional");
      setIsDiscussionSaved(false);
  };

  const generateContent = () => {
    let content = `${t.title}\n====================\n\n`;
    content += `Topic: ${topic}\n\n`;
    
    if (uploadedFiles.length > 0) {
      content += `--- UPLOADED FILES ---\n`;
      uploadedFiles.forEach(file => {
        content += `- ${file.name}\n`;
      });
      content += `\n`;
    }
    
    if (urls.length > 0) {
      content += `--- URLS ---\n`;
      urls.forEach(url => {
        content += `- ${url}\n`;
      });
      content += `\n`;
    }
    
    content += `--- PARTICIPANTS ---\n`;
     flatSelectedModels.forEach(({ provider, model }) => {
        const key = `${provider}/${model}`;
        const initialRole = modelRoles[provider]?.[model] || 'N/A';
        const clarification = clarifiedRoles[key];
        content += `\nModel: ${key}\nRole: ${initialRole}\n`;
        if (clarification) {
            content += `Clarified Tasks:\n${clarification.clarified_tasks}\n`;
            content += `Thinking Style: ${clarification.thinking_style}\n`;
        }
    });
    content += `\n====================\n\n`;

    history.forEach(h => {
        content += `--- ROUND ${h.round} ---\n\n`;
        content += `[${t.discussionSummary}]\n${h.summary}\n\n`;
        content += `[${t.roundPlan}]\n`;
        h.plan.calls.forEach(call => {
            content += `- Model: ${call.provider}/${call.model} (${call.role})\n`;
            content += `  Prompt: ${call.prompt}\n`;
        });
        
        if (h.execution_results) {
            content += `\n[${t.executionResults}]\n`;
            h.execution_results.forEach(res => {
                const role = modelRoles[res.provider]?.[res.model] || '';
                content += `\n>> Response from ${role} (${res.provider}/${res.model}):\n`;
                content += `${res.response}\n`;
            });
        }
        content += `\n---------------------\n\n`;
    });

    const finalReport = history[history.length - 1]?.final_report;
    if (finalReport) {
        content += `--- FINAL REPORT ---\n\n`;
        content += `[${t.consensus}]\n${finalReport.consensus}\n\n`;
        content += `[${t.keyPoints}]\n`;
        finalReport.bullet_summary.forEach(p => content += `- ${p}\n`);
        content += `\n[${t.documentOutline}]\n`;
        finalReport.doc_body_blocks.forEach(b => {
            content += `\n## ${b.heading}\n${b.content}\n`;
        });
    }
    return content;
  };

  const handleDownloadTranscript = () => {
    const content = generateContent();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discussion-transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDoc = () => {
    const content = generateContent();
    const docContent = `<html><head><meta charset="utf-8"><title>Discussion Report</title><style>* { font-family: 'Arial', 'Noto Sans TC', 'Noto Sans SC', sans-serif !important; }</style></head><body><pre>${content.replace(/\n/g, '<br>')}</pre></body></html>`;
    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discussion-report.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCode = () => {
    let codeContent = `// Generated from Multi-LLM Code Review\n// Original Code:\n${codeInput}\n\n`;
    const finalReport = history[history.length - 1]?.final_report;
    if (finalReport) {
      codeContent += `// Consensus Solution:\n// ${finalReport.consensus.replace(/\n/g, '\n// ')}\n\n`;
      finalReport.doc_body_blocks.forEach(block => {
        if (block.heading.toLowerCase().includes('code') || block.heading.toLowerCase().includes('solution')) {
          codeContent += `// ${block.heading}:\n// ${block.content.replace(/\n/g, '\n// ')}\n\n`;
        }
      });
    }
    const blob = new Blob([codeContent], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reviewed-code.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- UI Handlers ---
  const handleModelSelectionChange = (provider: string, model: string, isChecked: boolean) => {
      setSelectedModels(p => {
          const models = p[provider] || [];
          const newModels = isChecked ? [...models, model] : models.filter(m => m !== model);
          const newSelected = { ...p, [provider]: newModels };
          if (newModels.length === 0) delete newSelected[provider];
          return newSelected;
      });
      if (!isChecked) {
          setModelRoles(p => {
              const roles = { ...p[provider] };
              delete roles[model];
              const newRoles = { ...p, [provider]: roles };
              if (Object.keys(roles).length === 0) delete newRoles[provider];
              return newRoles;
          });
      }
  };
  const handleRoleChange = (p: string, m: string, role: string) => setModelRoles(prev => ({ ...prev, [p]: { ...prev[p], [m]: role }}));
  const handleClarificationChange = (key: string, field: 'tasks' | 'style', value: string) => {
    setClarifiedRoles(prev => ({...prev, [key]: {
        clarified_tasks: field === 'tasks' ? value : prev[key].clarified_tasks,
        thinking_style: field === 'style' ? value : prev[key].thinking_style,
    }}));
  }
  const handleApiKeyChange = (p: string, key: string) => setApiKeys(prev => ({...prev, [p]: key}));
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };
  
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const addUrl = () => {
    if (newUrl.trim()) {
      setUrls(prev => [...prev, newUrl.trim()]);
      setNewUrl("");
    }
  };
  
  const removeUrl = (index: number) => {
    setUrls(prev => prev.filter((_, i) => i !== index));
  };

  // --- RENDER FUNCTIONS ---
  const renderHeader = () => (<header>
      <div className="title-bar"><h1>{t.title}</h1>
        <div className="header-controls">
          <button onClick={() => setShowHistoryModal(true)} disabled={loadingAction !== null} className="history-btn">{t.discussionHistory}</button>
          <div className="language-switcher">
            <button onClick={() => setLanguage('en')} className={language === 'en' ? 'active' : ''} disabled={loadingAction !== null}>English</button>
            <button onClick={() => setLanguage('zh')} className={language === 'zh' ? 'active' : ''} disabled={loadingAction !== null}>中文</button>
          </div>
        </div>
      </div><p>{t.description}</p>
    </header>);

  const renderStepIndicator = () => (<div className="step-indicator">
        {Object.entries(t.steps).map(([key, value]) => {
            const stepKey = key as AppStep;
            const isCompleted = (stepKey === 'CONFIG' && (appStep === 'SCOPING' || appStep === 'CLARIFICATION' || appStep === 'DISCUSSION')) ||
                                (stepKey === 'SCOPING' && (appStep === 'CLARIFICATION' || appStep === 'DISCUSSION')) ||
                                (stepKey === 'CLARIFICATION' && appStep === 'DISCUSSION');
            return (<div key={key} className={`step ${appStep === stepKey ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>{value}</div>);
        })}
    </div>);

  const renderConfigStep = () => (<div className="card input-section">
      {renderStepIndicator()}
      <div className="model-selection-section" style={{borderTop: 'none', paddingTop: 0}}>
          <h3>{t.selectModels}</h3>
          <div className="providers-grid">{Object.entries(AVAILABLE_MODELS).map(([provider, models]) => (
              <div key={provider} className="provider-group">
                <h4>{provider}</h4>
                <p className="provider-capabilities">{MODEL_CAPABILITIES[language][provider]}</p>
                <div className="model-list">{models.map(model => (
                    <label key={model}><input type="checkbox" checked={selectedModels[provider]?.includes(model) || false}
                        onChange={(e) => handleModelSelectionChange(provider, model, e.target.checked)} disabled={loadingAction !== null}/> {model}</label>
                ))}</div>
              </div>))}
          </div>
      </div>
      {Object.keys(selectedModels).length > 0 && (<div className="api-key-section">
          <h3>{t.apiKeysTitle}</h3><p className="helper-text">{t.apiKeysHelper}</p>
          <div className="api-key-grid">{Object.keys(selectedModels).map(provider => (
            <input key={provider} type="password" placeholder={t.apiKeyPlaceholder(provider)} value={apiKeys[provider] || ''} onChange={(e) => handleApiKeyChange(provider, e.target.value)} disabled={loadingAction !== null} />
          ))}</div>
        </div>)}
      <div className="button-group">
          <div></div> {/* Spacer */}
          <button onClick={() => setAppStep('SCOPING')} disabled={loadingAction !== null || !apiKeys['Google'] || flatSelectedModels.length === 0}>{t.next}</button>
      </div>
    </div>);
  
  const suggestRolesForTopic = (topicText: string) => {
    if (!topicText.trim() || selectedTemplate) return;
    
    const lowerTopic = topicText.toLowerCase();
    const newModelRoles: ModelRoles = {};
    
    flatSelectedModels.forEach(({ provider, model }) => {
      if (!newModelRoles[provider]) newModelRoles[provider] = {};
      
      let suggestedRole = '';
      if (lowerTopic.includes('business') || lowerTopic.includes('strategy') || lowerTopic.includes('market')) {
        const roles = ['Business Analyst', 'Market Researcher', 'Strategy Consultant', 'Financial Advisor'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('technical') || lowerTopic.includes('code') || lowerTopic.includes('software')) {
        const roles = ['Technical Lead', 'Software Architect', 'DevOps Engineer', 'Code Reviewer'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('medical') || lowerTopic.includes('health') || lowerTopic.includes('clinical')) {
        const roles = ['Medical Researcher', 'Clinical Specialist', 'Health Analyst', 'Biostatistician'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('product') || lowerTopic.includes('design') || lowerTopic.includes('innovation')) {
        const roles = ['Product Manager', 'UX Designer', 'Innovation Strategist', 'User Researcher'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('investment') || lowerTopic.includes('finance') || lowerTopic.includes('portfolio')) {
        const roles = ['Investment Analyst', 'Financial Advisor', 'Risk Manager', 'Portfolio Strategist'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('education') || lowerTopic.includes('learning') || lowerTopic.includes('teaching')) {
        const roles = ['Education Specialist', 'Learning Designer', 'Curriculum Expert', 'EdTech Analyst'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else if (lowerTopic.includes('security') || lowerTopic.includes('cyber') || lowerTopic.includes('risk')) {
        const roles = ['Security Analyst', 'Risk Assessor', 'Compliance Expert', 'Cybersecurity Specialist'];
        suggestedRole = roles[Math.floor(Math.random() * roles.length)];
      } else {
        const genericRoles = ['Subject Matter Expert', 'Analyst', 'Consultant', 'Specialist', 'Advisor'];
        suggestedRole = genericRoles[Math.floor(Math.random() * genericRoles.length)];
      }
      
      newModelRoles[provider][model] = suggestedRole;
    });
    
    setModelRoles(newModelRoles);
  };

  const handleTemplateSelect = (templateName: string) => {
    const template = COLLABORATION_TEMPLATES[language][templateName];
    if (template) {
      setSelectedTemplate(templateName);
      setTopic(template.topic);
      setIsCodeMode(template.isCodeMode || false);
      
      // 只為已選擇的模型設定角色，不修改模型選擇
      const newModelRoles: ModelRoles = {};
      
      flatSelectedModels.forEach(({ provider, model }) => {
        if (!newModelRoles[provider]) newModelRoles[provider] = {};
        
        // 從模板中找到對應的角色，如果沒有則使用通用角色
        const templateRole = template.roles[provider];
        newModelRoles[provider][model] = templateRole || 'Subject Matter Expert';
      });
      
      setModelRoles(newModelRoles);
    }
  };

  const renderScopingStep = () => (<div className="card input-section">
        {renderStepIndicator()}
        
        <div className="template-section">
          <h3>{t.discussionTemplates}</h3>
          <div className="template-grid">
            {Object.keys(COLLABORATION_TEMPLATES[language]).map(templateName => (
              <button key={templateName} type="button" className={`template-btn ${selectedTemplate === templateName ? 'active' : ''}`} 
                      onClick={() => handleTemplateSelect(templateName)} disabled={loadingAction !== null}>
                {templateName}
              </button>
            ))}
          </div>
          {selectedTemplate && (
            <div style={{textAlign: 'center', marginTop: '1rem'}}>
              <button type="button" className="template-btn" 
                      onClick={() => { setSelectedTemplate(null); setTopic(''); setIsCodeMode(false); }} 
                      disabled={loadingAction !== null}>
                {t.customTopic}
              </button>
            </div>
          )}
        </div>
        
        <div className="style-section">
          <h3>{t.discussionStyle}</h3>
          <select value={discussionStyle} onChange={(e) => setDiscussionStyle(e.target.value)} disabled={loadingAction !== null}>
            {Object.keys(DISCUSSION_STYLES[language]).map(style => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </div>
        
        {(selectedTemplate === 'Code Architecture Review' || selectedTemplate === '程式架構審查') && (
          <div className="mode-toggle">
            <label><input type="checkbox" checked={isCodeMode} onChange={(e) => setIsCodeMode(e.target.checked)} disabled={loadingAction !== null} /> {t.codeDebugMode}</label>
          </div>
        )}
        
        {isCodeMode ? (
          <>
            <h3>{t.codeInput}</h3>
            <textarea value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder={t.codePlaceholder} rows={8} disabled={loadingAction !== null} style={{fontFamily: 'monospace'}} />
            <h3>{t.errorDescription}</h3>
            <textarea value={errorDescription} onChange={(e) => setErrorDescription(e.target.value)} placeholder={t.errorPlaceholder} rows={3} disabled={loadingAction !== null} />
          </>
        ) : (
          <textarea value={topic} onChange={(e) => { setTopic(e.target.value); suggestRolesForTopic(e.target.value); }} placeholder={t.topicPlaceholder} rows={4} disabled={loadingAction !== null} />
        )}
        
        <div className="file-upload-section">
          <h3>{t.uploadFiles}</h3>
          <label className="file-upload-label">
            <input type="file" multiple onChange={handleFileUpload} disabled={loadingAction !== null} accept=".txt,.pdf,.doc,.docx,.md" style={{display: 'none'}} />
            <span className="file-upload-button">{language === 'zh' ? '選擇檔案' : 'Choose Files'}</span>
            <span className="file-upload-text">{uploadedFiles.length === 0 ? (language === 'zh' ? '支援 .txt, .pdf, .doc, .docx, .md' : 'Supports .txt, .pdf, .doc, .docx, .md') : `${uploadedFiles.length} file(s) selected`}</span>
          </label>
          {uploadedFiles.length > 0 && (
            <div className="uploaded-files">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="role-card">
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} disabled={loadingAction !== null} className="remove-btn">{t.removeFile}</button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="url-input-section">
          <h3>{t.addUrls}</h3>
          <div className="url-input-group">
            <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={t.urlPlaceholder} disabled={loadingAction !== null} />
            <button type="button" onClick={addUrl} disabled={loadingAction !== null || !newUrl.trim()}>{t.addUrl}</button>
          </div>
          {urls.length > 0 && (
            <div className="url-list">
              {urls.map((url, index) => (
                <div key={index} className="role-card">
                  <span style={{wordBreak: 'break-all'}}>{url}</span>
                  <button type="button" onClick={() => removeUrl(index)} disabled={loadingAction !== null} className="remove-btn">{t.removeUrl}</button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {flatSelectedModels.filter(({ provider }) => apiKeys[provider]).length > 0 && (
          <div className="role-assignment-section"><h3>{t.assignCompanyRole}</h3>
              <div className="role-assignment-list">{flatSelectedModels.filter(({ provider }) => apiKeys[provider]).map(({ provider, model }) => (
                  <div key={`${provider}-${model}`} className="role-card">
                      <strong>{provider} / {model}</strong>
                      <input type="text" placeholder={t.assignRolePlaceholder} value={modelRoles[provider]?.[model] || ''}
                             onChange={(e) => handleRoleChange(provider, model, e.target.value)} disabled={loadingAction !== null} style={{ marginTop: '0.5rem' }} />
                  </div>
              ))}</div>
          </div>
        )}
        <div className="button-group">
            <button className="secondary" onClick={() => setAppStep('CONFIG')} disabled={loadingAction !== null}>{t.back}</button>
            <button onClick={handleClarifyRoles} disabled={loadingAction !== null || (!isCodeMode && !topic.trim()) || (isCodeMode && !codeInput.trim()) || flatSelectedModels.some(({provider, model}) => !modelRoles[provider]?.[model]?.trim())}>
                {t.clarifyRoles} {loadingAction === 'clarify' && <InlineLoader />}
            </button>
        </div>
    </div>);

  const renderClarificationStep = () => (<div className="card input-section">
        {renderStepIndicator()}
        <h3>{t.editClarifiedRoles}</h3>
        <div className="clarification-list">{Object.entries(clarifiedRoles).map(([key, { clarified_tasks, thinking_style }]) => {
            const [provider, model] = key.split('/');
            return (
              <div key={key} className="clarification-card">
                <strong>{key} <span style={{color: '#fff', fontSize: '0.9em'}}>({modelRoles[provider]?.[model]})</span></strong>
                <h4>{t.clarifiedTasks}</h4>
                <textarea value={clarified_tasks} onChange={e => handleClarificationChange(key, 'tasks', e.target.value)} disabled={loadingAction !== null} />
                <h4>{t.thinkingStyle}</h4>
                <textarea value={thinking_style} onChange={e => handleClarificationChange(key, 'style', e.target.value)} disabled={loadingAction !== null} />
              </div>
            );
        })}</div>
        <div className="button-group">
            <button className="secondary" onClick={() => setAppStep('SCOPING')} disabled={loadingAction !== null}>{t.back}</button>
            <button onClick={() => { handleProcessRound(); setAppStep('DISCUSSION'); }} disabled={loadingAction !== null}>
                {t.startDiscussion} {loadingAction === 'process' && <InlineLoader />}
            </button>
        </div>
    </div>);
  
  const renderDiscussion = () => (
    <>
      <div className="card">
        {renderStepIndicator()}
        <button onClick={startNewDiscussion} disabled={loadingAction !== null} style={{alignSelf: 'flex-start'}}>{t.startNewDiscussion}</button>
      </div>
      <div className="results-section">
          {history.map((item, index) => (
              <div key={item.round} className="card">
                  <div className="round-container">
                      <h2>{t.round} {item.round}</h2><h3>{t.discussionSummary}</h3><p>{item.summary}</p>
                      <h3>{t.roundPlan}</h3>
                      {item.plan.calls.map((call, callIndex) => (
                          <div key={callIndex} className="call-card"><strong>{call.provider}/{call.model}</strong>
                              <div className="role">{call.role}</div>
                              <pre><code>{call.prompt.split('\n').map((line, i) => {
                                if (line.trim() === '') return <br key={i} />;
                                if (line.trim().match(/^[\d\-\*•]/) || line.includes(':')) {
                                  return <div key={i} style={{marginBottom: '0.5rem'}}>{line}</div>;
                                }
                                return <div key={i} style={{marginBottom: '1rem'}}>{line}</div>;
                              })}</code></pre>
                          </div>
                      ))}
                  </div>

                  {item.execution_results && (
                    <div className="execution-results-section">
                        <h3>{t.executionResults}</h3>
                        {item.execution_results.map((result, resIndex) => (
                          <div key={resIndex} className="execution-result-card">
                            <strong>{modelRoles[result.provider]?.[result.model] || ''} ({result.provider}/{result.model})</strong>
                            <pre><code>{result.response}</code></pre>
                          </div>
                        ))}
                    </div>
                  )}

                  {item.final_report && (
                       <div className="final-report">
                           <h2>{t.finalReport}</h2>
                           <div className="stop-reason">{t.stopReason}: {t.stopConditions[item.plan.stop_condition]}</div>
                           <h3>{t.consensus}</h3><p>{item.final_report.consensus}</p>
                           <h3>{t.keyPoints}</h3><ul>{item.final_report.bullet_summary.map((p, i) => <li key={i}>{p}</li>)}</ul>
                           <h3>{t.documentOutline}</h3>{item.final_report.doc_body_blocks.map((block, i) => (
                                <div key={i} className="doc-block"><h4>{block.heading}</h4><p>{block.content}</p></div>))}
                           
                           <div className="button-group final-report-buttons">
                                <button className="secondary" onClick={handleDownloadTranscript} disabled={loadingAction !== null}>{t.downloadTranscript}</button>
                                <button className="tertiary" onClick={handleDownloadDoc} disabled={loadingAction !== null}>{t.downloadDoc}</button>
                                {isCodeMode && <button className="tertiary" onClick={handleDownloadCode} disabled={loadingAction !== null}>{t.downloadCode}</button>}
                                <button className="tertiary" onClick={saveCurrentDiscussion} disabled={loadingAction !== null || isDiscussionSaved}>
                                  {isDiscussionSaved ? (language === 'zh' ? '討論已儲存' : 'Discussion Saved') : t.saveDiscussion}
                                </button>
                                {!isAskingFollowUp && <button onClick={() => setIsAskingFollowUp(true)} disabled={loadingAction !== null}>{t.askFollowUp}</button>}
                           </div>

                            {isAskingFollowUp && (
                                <div className="follow-up-section">
                                    <textarea
                                        value={followUpQuestion}
                                        onChange={(e) => setFollowUpQuestion(e.target.value)}
                                        placeholder={t.followUpPlaceholder}
                                        rows={4}
                                        disabled={loadingAction !== null}
                                    />
                                    <div className="button-group">
                                        <button className="secondary" onClick={() => setIsAskingFollowUp(false)} disabled={loadingAction !== null}>{t.back}</button>
                                        <button onClick={handleContinueWithFollowUp} disabled={loadingAction !== null || !followUpQuestion.trim()}>
                                            {t.submitFollowUp} {loadingAction === 'continue' && <InlineLoader />}
                                        </button>
                                    </div>
                                </div>
                            )}
                       </div>
                  )}

                  {history.length === index + 1 && !isFinished && (
                     <div className="button-group" style={{ justifyContent: item.execution_results ? 'space-between' : 'flex-end' }}>
                        {item.execution_results ? (
                            <>
                                <button onClick={handleStopDiscussion} className="danger" disabled={loadingAction !== null}>
                                    {t.stopAndSummarize} {loadingAction === 'stop' && <InlineLoader />}
                                </button>
                                <button onClick={() => handleProcessRound()} disabled={loadingAction !== null}>
                                    {t.proceedToRound(item.round + 1)} {loadingAction === 'process' && <InlineLoader />}
                                </button>
                            </>
                        ) : (
                            <button onClick={handleExecuteRound} disabled={loadingAction !== null}>
                                {t.executeTasks} {loadingAction === 'execute' && <InlineLoader />}
                            </button>
                        )}
                     </div>
                  )}
              </div>
          ))}
          <div ref={resultsEndRef} />
      </div>
    </>
  );

  const renderHistoryModal = () => (
    showHistoryModal && (
      <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{t.discussionHistory}</h2>
            <button onClick={() => setShowHistoryModal(false)} className="close-btn">×</button>
          </div>
          <div className="modal-body">
            {savedDiscussions.length === 0 ? (
              <p className="no-discussions">{t.noSavedDiscussions}</p>
            ) : (
              <>
                <div className="search-section">
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
                <div className="discussion-list">
                  {(() => {
                    const filteredDiscussions = savedDiscussions.filter(discussion => 
                      discussion.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      discussion.topic.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    
                    if (searchQuery.trim() && filteredDiscussions.length === 0) {
                      return <p className="no-discussions">{t.noSearchResults}</p>;
                    }
                    
                    return filteredDiscussions.map((discussion) => (
                  <div key={discussion.id} className="discussion-item">
                    <div className="discussion-info">
                      <h4>{discussion.title}</h4>
                      <p className="discussion-meta">
                        {new Date(discussion.timestamp).toLocaleString()} • 
                        {discussion.history.length} {language === 'zh' ? '回合' : 'rounds'} • 
                        {discussion.isFinished ? (language === 'zh' ? '已完成' : 'Completed') : (language === 'zh' ? '進行中' : 'In Progress')}
                      </p>
                    </div>
                    <div className="discussion-actions">
                      <button onClick={() => loadDiscussion(discussion)} className="load-btn">{t.loadDiscussion}</button>
                      <button onClick={() => { if (confirm(t.confirmDelete)) deleteDiscussion(discussion.id); }} className="delete-btn">{t.deleteDiscussion}</button>
                    </div>
                  </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  );

  return (<>
      {renderHeader()}
      {error && <div className="card error-message">{error}</div>}
      {saveMessage && <div className="card save-message">{saveMessage}</div>}
      
      {appStep === 'CONFIG' && renderConfigStep()}
      {appStep === 'SCOPING' && renderScopingStep()}
      {appStep === 'CLARIFICATION' && renderClarificationStep()}
      {appStep === 'DISCUSSION' && renderDiscussion()}
      {renderHistoryModal()}
    </>);
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// 在頁面卸載時自動儲存當前討論
window.addEventListener('beforeunload', () => {
  const currentTopic = (document.querySelector('textarea[placeholder*="topic"]') as HTMLTextAreaElement)?.value;
  if (currentTopic?.trim()) {
    // 這裡可以觸發儲存，但由於 React 狀態的限制，主要依賴組件內的自動儲存
  }
});