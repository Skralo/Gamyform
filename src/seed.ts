import type { Definition } from "./domain";
export const seed: Definition = {
  schemaVersion: 1,
  title: "Build your next AI system",
  description:
    "Five quick questions about what you want to build.",
  locale: "en",
  privacyUrl: "",
  questions: [
    {
      id: "q_goal",
      type: "single_choice",
      label: "What would you like to improve?",
      help: "",
      required: true,
      options: [
        { id: "operations", label: "Operations & repetitive work" },
        { id: "sales", label: "Lead handling & sales" },
        { id: "knowledge", label: "Company knowledge" },
        { id: "unsure", label: "Help me find the opportunity" },
      ],
    },
    {
      id: "q_team",
      type: "number",
      label: "How many people are on your team?",
      help: "",
      required: false,
      min: 1,
      max: 100,
      step: 1,
      displayStart: 1,
    },
    {
      id: "q_name",
      type: "short_text",
      label: "What should I call you?",
      help: "",
      required: true,
      maxLength: 120,
      contactRole: "name",
    },
    {
      id: "q_email",
      type: "email",
      label: "Where can I reply?",
      help: "I’ll only use it to reply.",
      required: true,
      maxLength: 254,
      contactRole: "email",
    },
    {
      id: "q_note",
      type: "short_text",
      label: "Anything else on your mind?",
      help: "",
      required: false,
      maxLength: 500,
    },
  ],
  completion: {
    title: "Right on target.",
    message:
      "Your enquiry has been received. Thank you for sharing what you want to build.",
  },
};
