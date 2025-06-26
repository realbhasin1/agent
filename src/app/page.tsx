"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, MessageSquarePlus, Trash2, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  chat_title: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatTitle, setActiveChatTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newUploadInputRef = useRef<HTMLInputElement>(null);

  const fetchChats = async () => {
    try {
      const response = await fetch('/api/chats');
      if (!response.ok) {
        if (response.status === 404) {
          console.warn('GET /api/chats 404 - No chats found, which can be normal.');
          setChats([]);
          return;
        }
        throw new Error(`Failed to fetch chats: ${response.statusText}`);
      }
      const data = await response.json();
      setChats(data.chats || []);
    } catch (err: any) {
      console.error("Error fetching chats:", err);
      setError('Failed to load chat history. Please try refreshing.');
    }
  };

  useEffect(() => {
    fetchChats();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      setChats((prev) => [data.chat, ...prev]);
      setActiveChat(data.chat.id);
      setActiveChatTitle(data.chat.chat_title);
      setMessages([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      setFile(null);
    }
  };

  const handleUploadInChat = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileToUpload = e.target.files?.[0];
    if (!fileToUpload) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      setChats((prev) => [data.chat, ...prev]);
      setActiveChat(data.chat.id);
      setActiveChatTitle(data.chat.chat_title);
      setMessages([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = ""; // Reset input
    }
  };

  const handleSendMessage = async (messageContent?: string) => {
    const messageToSend = messageContent || currentMessage;
    if (!messageToSend.trim() || !activeChat) return;

    const userMessage: Message = { role: 'user', content: messageToSend };
    // This single state update prevents a race condition that garbles the streamed response.
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }]);
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend, chatId: activeChat }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error("Response body is empty.");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        setMessages((prevMessages) => {
          return prevMessages.map((msg, index) => {
            if (index === prevMessages.length - 1 && msg.role === 'assistant') {
              return { ...msg, content: msg.content + chunk };
            }
            return msg;
          });
        });
      }

    } catch (err: any) {
      console.error("Error sending message:", err);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = `Sorry, an error occurred: ${err.message}`;
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setActiveChat(chat.id);
      setActiveChatTitle(chat.chat_title);
    }
    setIsFetchingMessages(true);
    setMessages([]); // Immediately clear messages to show loading state
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      setError('Failed to load messages.');
    } finally {
      setIsFetchingMessages(false);
    }
  };

  const promptPills = ["Summarize this document", "What are the key takeaways?", "Who is the author?"];
  const isChatReady = activeChat !== null;

  return (
    <div className="flex h-screen bg-primary-light font-sans">
      {/* Left Sidebar: Chat History */}
      <aside className="w-80 flex flex-col bg-white p-4 border-r">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Chats</h1>
          <Button onClick={() => { setActiveChat(null); setActiveChatTitle(null); }} variant="outline" size="icon" className="border-primary-medium text-primary">
            <PlusIcon className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-grow overflow-y-auto -mr-4 pr-4">
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li key={chat.id}>
                <Button
                  variant={activeChat === chat.id ? "secondary" : "ghost"}
                  className="w-full justify-between h-auto py-2 px-3 whitespace-normal text-left"
                  onClick={() => fetchMessages(chat.id)}
                >
                  <span className="flex-1 truncate text-sm font-medium">{chat.chat_title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveChat(null);
                      setActiveChatTitle(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </Button>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Content: Chat Interface */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 p-6 md:p-8 lg:p-12">
          <Card className="h-full flex flex-col shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">AI Agent</CardTitle>
              <CardDescription>
                {activeChat ? `Ready to chat about ${activeChatTitle}` : "Upload a PDF to start a new chat session"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 flex-grow">
              {!activeChat && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pdf-upload" className="font-semibold">
                    Upload PDF to begin
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input ref={fileInputRef} id="pdf-upload" type="file" accept="application/pdf" onChange={handleFileChange} className="flex-grow" />
                    <Button onClick={handleUpload} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!file || isUploading}>
                      <FileUp className="h-4 w-4 mr-2" />
                      {isUploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                  {error && (
                    <p className="text-sm mt-2 text-red-500">
                      {error}
                    </p>
                  )}
                </div>
              )}
              <div className="border rounded-lg p-4 flex-grow flex flex-col bg-gray-50">
                <div className="flex-grow overflow-y-auto pr-4 space-y-4">
                  {messages.length > 0 ? (
                    messages.map((msg, index) => (
                      <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`p-3 rounded-lg max-w-md prose ${msg.role === "user" ? "bg-primary text-white" : "bg-white text-gray-800 shadow-sm"}`}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      {isFetchingMessages
                        ? "Loading messages..."
                        : activeChat
                        ? "Ask a question to get started."
                        : "Select a chat from the left or upload a document to start."}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {promptPills.map((prompt, i) => (
                      <Button key={i} variant="outline" size="sm" onClick={() => handleSendMessage(prompt)} className="text-xs" disabled={!isChatReady || isLoading}>
                        {prompt}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Textarea
                      placeholder={isChatReady ? "Type your question..." : "Please upload a document to start a chat."}
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="flex-grow"
                      disabled={!isChatReady || isLoading}
                    />
                    <Input
                        type="file"
                        ref={newUploadInputRef}
                        onChange={handleUploadInChat}
                        accept="application/pdf"
                        className="hidden"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => newUploadInputRef.current?.click()}
                        disabled={isUploading || !isChatReady}
                        title="Upload a new document"
                    >
                      <FileUp className="h-5 w-5" />
                    </Button>
                    <Button onClick={() => handleSendMessage()} disabled={!isChatReady || isLoading} className="self-end bg-primary text-primary-foreground hover:bg-primary/90">
                      {isLoading ? "Sending..." : isUploading ? "Uploading..." : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Right Sidebar: Customer Profile */}
      <aside className="w-96 p-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Customer Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label>Name</Label>
              <p className="text-sm text-gray-500">John Doe</p>
            </div>
            <div>
              <Label>Email</Label>
              <p className="text-sm text-gray-500">john.doe@example.com</p>
            </div>
            <div>
              <Label>Phone</Label>
              <p className="text-sm text-gray-500">123-456-7890</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline">Edit Profile</Button>
          </CardFooter>
        </Card>
      </aside>
    </div>
  );
}
