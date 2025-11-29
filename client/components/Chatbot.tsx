import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- MESSAGE TYPE ---------------- */
interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

/* ---------------- STATIC RESPONSES ---------------- */
const staticResponses: Record<string, string> = {
  "hi": "Hello! How can I assist you today?",
  "hello": "Hello! How can I help you with NAMASTE codes or ICD-11?",
  "hey": "Hey! What medical or mapping query can I answer?",
  "bye": "Goodbye! Let me know anytime if you need help again.",
  "thanks": "You’re welcome! 😊",
  "thank you": "Happy to help! 🙌",

  // NAMASTE / ICD-11 related
  "what is namaste": "NAMASTE is an Indian traditional medicine coding system for Ayurveda, Siddha, and Unani diagnoses.",
  "namaste code": "NAMASTE codes are traditional medicine diagnosis codes used in India. Tell me your condition, and I’ll try to find its mapping.",
  "icd11": "ICD-11 is WHO’s international classification for diseases. I can help map NAMASTE → ICD-11.",
  "map namaste to icd11": "Tell me the NAMASTE code or symptom, and I’ll show you the ICD-11 mapping.",
};

/* ------ Dynamic rule-based static mapping ------ */
function generateStaticReply(input: string) {
  const text = input.toLowerCase().trim();

  // exact keyword match
  if (staticResponses[text]) return staticResponses[text];

  // simple symptom-based responses
  if (text.includes("fever"))
    return "Fever usually maps to ICD-11 code: MG40. NAMASTE code depends on the system (Ayurveda/Siddha/Unani).";

  if (text.includes("cough"))
    return "Cough corresponds to ICD-11 code: CA23. NAMASTE mapping varies per traditional medicine category.";

  if (text.includes("cold"))
    return "Common cold generally maps to ICD-11: RA01. You can specify Ayurveda/Siddha/Unani for NAMASTE code.";

  if (text.includes("headache"))
    return "Headache maps to ICD-11: 8A80. In NAMASTE Ayurveda, it may relate to 'Shiroroga' categories.";

  if (text.includes("pain"))
    return "Pain-related conditions have many ICD-11 mappings (e.g., chronic pain: MG30). Provide a location for accuracy.";

  // NAMASTE → ICD suggestions
  if (text.includes("ayurveda"))
    return "Ayurveda NAMASTE codes include disorders like 'Vata Vyadhi', 'Pitta Vyadhi'. Tell me a specific condition.";

  if (text.includes("siddha"))
    return "Siddha NAMASTE diagnoses include Vadham, Pittam, Silethumam, etc. Tell me a condition to map.";

  if (text.includes("unani"))
    return "Unani diagnoses include Balgham, Dam, Safra, and Sawda imbalances. Provide a condition for mapping.";

  // default fallback
  return "I didn’t fully understand that, but I can help with NAMASTE codes, ICD-11 mapping, symptoms, or medical classification. Try asking about a condition or code!";
}

/* ---------------------- CHATBOT COMPONENT ---------------------- */
export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: "Welcome to Care Sync! I'm your assistant. How can I help you today?",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /* ---------------------- HANDLE SEND ---------------------- */
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    const userInput = inputValue;
    setInputValue("");
    setIsLoading(true);

    // STATIC bot reply
    const reply = generateStaticReply(userInput);

    const botMessage: Message = {
      id: `msg-${Date.now()}-bot`,
      text: reply,
      sender: "bot",
      timestamp: new Date(),
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, botMessage]);
      setIsLoading(false);
    }, 600);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* ---------------------- UI ---------------------- */
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary hover:bg-secondary text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        title="Open Chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] flex flex-col rounded-lg shadow-xl border border-border bg-background z-50 animate-slide-up">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-primary text-white rounded-t-lg">
        <h3 className="font-semibold">Care Sync Assistant</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-primary/80 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-2",
              message.sender === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-xs px-4 py-2 rounded-lg text-sm",
                message.sender === "user"
                  ? "bg-primary text-white rounded-br-none"
                  : "bg-muted text-foreground rounded-bl-none"
              )}
            >
              {message.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="bg-muted text-foreground px-4 py-2 rounded-lg rounded-bl-none text-sm">
              <span className="inline-flex gap-1">
                <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
                <span
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></span>
                <span
                  className="w-2 h-2 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Type your question..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            size="sm"
            className="gap-2"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Ask me anything about NAMASTE codes, ICD-11, symptoms or mappings!
        </p>
      </div>
    </div>
  );
}
