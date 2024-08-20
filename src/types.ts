// Utility types
export type Identifier = string // Matches the identifier format described in the spec
export type ContentType = 'text/markdown' | 'text/plain'
export type FeedbackType = 'like' | 'dislike'
export type ErrorType = 'user_message_too_long' | string // Add other error types as needed

// Message-related types
export interface ProtocolMessage {
  role: 'system' | 'user' | 'bot'
  content: string
  content_type: ContentType
  timestamp: number
  message_id: Identifier
  feedback: MessageFeedback[]
  attachments: Attachment[]
}

export interface MessageFeedback {
  type: FeedbackType
  reason?: string
}

export interface Attachment {
  url: string
  content_type: string
  name: string
  parsed_content?: string
}

// Request types
export interface QueryRequest {
  query: ProtocolMessage[]
  user_id: Identifier
  conversation_id: Identifier
  message_id: Identifier
  access_key: string
  temperature?: number
  skip_system_prompt?: boolean
  logit_bias?: Record<string, number>
  stop_sequences?: string[]
  language_code?: string
}

export interface SettingsRequest {}

export interface ReportFeedbackRequest {
  message_id: Identifier
  user_id: Identifier
  conversation_id: Identifier
  feedback_type: FeedbackType
}

export interface ReportErrorRequest {
  message: string
  metadata: Record<string, any>
}

// Response types
export interface PartialResponse {
  text: string
  data?: Record<string, any>
  is_suggested_reply?: boolean
  is_replace_response?: boolean
}

export interface ErrorResponse {
  text: string
  raw_response?: any
  allow_retry?: boolean
  error_type?: ErrorType
}

export interface MetaResponse {
  suggested_replies?: boolean
  content_type?: ContentType
  refetch_settings?: boolean
}

export interface SettingsResponse {
  server_bot_dependencies?: Record<string, number>
  allow_attachments?: boolean
  introduction_message?: string
  expand_text_attachments?: boolean
  enable_image_comprehension?: boolean
  enforce_author_role_alternation?: boolean
  enable_multi_bot_chat_prompting?: boolean
}

// Tool-related types (for OpenAI function calling)
export interface FunctionDefinition {
  name: string
  description: string
  parameters: Record<string, any> // This should be a JSON Schema object
}

export interface ToolDefinition {
  type: string
  function: FunctionDefinition
}

export interface ToolCallDefinition {
  id: string
  type: string
  function: FunctionDefinition
}

export interface ToolResultDefinition {
  role: string
  name: string
  tool_call_id: string
  content: string
}
