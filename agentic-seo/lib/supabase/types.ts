// TypeScript types generated from Supabase schema
// Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/types.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: 'admin' | 'seo_manager' | 'seo_executive' | 'content_writer'
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: 'admin' | 'seo_manager' | 'seo_executive' | 'content_writer'
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      clients: {
        Row: {
          id: string
          name: string
          domain: string | null
          logo_url: string | null
          description: string | null
          category: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          domain?: string | null
          logo_url?: string | null
          description?: string | null
          category?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      client_members: {
        Row: {
          id: string
          client_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          user_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_members']['Insert']>
      }
      chat_sessions: {
        Row: {
          id: string
          client_id: string
          user_id: string
          department_id: string | null
          title: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          user_id: string
          department_id?: string | null
          title?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_sessions']['Insert']>
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          client_id: string
          role: 'user' | 'assistant' | 'tool'
          content: string
          tool_name: string | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          client_id: string
          role: 'user' | 'assistant' | 'tool'
          content: string
          tool_name?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>
      }
      tasks: {
        Row: {
          id: string
          client_id: string
          department_id: string | null
          session_id: string | null
          user_id: string | null
          title: string
          description: string | null
          status: 'pending' | 'running' | 'completed' | 'failed'
          output: Record<string, unknown>
          steps: unknown[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          department_id?: string | null
          session_id?: string | null
          user_id?: string | null
          title: string
          description?: string | null
          status?: 'pending' | 'running' | 'completed' | 'failed'
          output?: Record<string, unknown>
          steps?: unknown[]
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
      }
      approvals: {
        Row: {
          id: string
          client_id: string
          department_id: string | null
          task_id: string | null
          task_run_id: string | null
          session_id: string | null
          action_type: string
          description: string | null
          payload: Record<string, unknown>
          status: 'pending' | 'approved' | 'rejected'
          decided_by: string | null
          decided_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          department_id?: string | null
          task_id?: string | null
          task_run_id?: string | null
          session_id?: string | null
          action_type: string
          description?: string | null
          payload?: Record<string, unknown>
          status?: 'pending' | 'approved' | 'rejected'
          decided_by?: string | null
          decided_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['approvals']['Insert']>
      }
      client_memory: {
        Row: {
          id: string
          client_id: string
          key: string
          value: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          key: string
          value: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['client_memory']['Insert']>
      }
      agency_memory: {
        Row: {
          id: string
          key: string
          value: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['agency_memory']['Insert']>
      }
      workflow_templates: {
        Row: {
          id: string
          name: string
          description: string | null
          steps: unknown[]
          department_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          steps?: unknown[]
          department_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['workflow_templates']['Insert']>
      }
      departments: {
        Row: {
          id: string
          name: string
          slug: 'seo' | 'execution' | 'design'
          description: string | null
          icon: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: 'seo' | 'execution' | 'design'
          description?: string | null
          icon?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['departments']['Insert']>
      }
      department_members: {
        Row: {
          id: string
          user_id: string
          department_id: string
          client_id: string
          dept_role: 'department_head' | 'team_lead' | 'employee' | 'client_viewer'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          department_id: string
          client_id: string
          dept_role?: 'department_head' | 'team_lead' | 'employee' | 'client_viewer'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['department_members']['Insert']>
      }
      task_runs: {
        Row: {
          id: string
          client_id: string
          workflow_template_id: string
          department_id: string | null
          status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed'
          current_step_index: number
          state: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          workflow_template_id: string
          department_id?: string | null
          status?: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed'
          current_step_index?: number
          state?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['task_runs']['Insert']>
      }
      keywords: {
        Row: {
          id: string
          client_id: string
          keyword: string
          landing_page: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          keyword: string
          landing_page?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['keywords']['Insert']>
      }
      backlinks: {
        Row: {
          id: string
          client_id: string
          keyword_id: string | null
          source_url: string
          target_url: string
          da: number | null
          pa: number | null
          spam_score: number | null
          status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'verified'
          result_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          keyword_id?: string | null
          source_url: string
          target_url: string
          da?: number | null
          pa?: number | null
          spam_score?: number | null
          status?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'verified'
          result_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['backlinks']['Insert']>
      }
      skills: {
        Row: {
          id: string
          skill_id: string
          name: string
          description: string | null
          category: string
          compatible_types: string[]
          is_inbuilt: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          skill_id: string
          name: string
          description?: string | null
          category: string
          compatible_types?: string[]
          is_inbuilt?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['skills']['Insert']>
      }
      task_run_logs: {
        Row: {
          id: string
          task_run_id: string
          step_index: number
          role: 'system' | 'user' | 'assistant' | 'tool'
          message: string
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          task_run_id: string
          step_index: number
          role: 'system' | 'user' | 'assistant' | 'tool'
          message: string
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['task_run_logs']['Insert']>
      }
    }
  }
}

// Convenience type aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type ClientMember = Database['public']['Tables']['client_members']['Row']
export type ChatSession = Database['public']['Tables']['chat_sessions']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type Approval = Database['public']['Tables']['approvals']['Row']
export type ClientMemory = Database['public']['Tables']['client_memory']['Row']
export type AgencyMemory = Database['public']['Tables']['agency_memory']['Row']
export type WorkflowTemplate = Database['public']['Tables']['workflow_templates']['Row']
export type TaskRun = Database['public']['Tables']['task_runs']['Row']
export type Keyword = Database['public']['Tables']['keywords']['Row']
export type Backlink = Database['public']['Tables']['backlinks']['Row']
export type Department = Database['public']['Tables']['departments']['Row']
export type DepartmentMember = Database['public']['Tables']['department_members']['Row']
export type Skill = Database['public']['Tables']['skills']['Row']
export type TaskRunLog = Database['public']['Tables']['task_run_logs']['Row']

export type UserRole = Profile['role']
export type DeptRole = DepartmentMember['dept_role']
export type DepartmentSlug = Department['slug']
export type TaskStatus = Task['status']
export type TaskRunStatus = TaskRun['status']
export type ApprovalStatus = Approval['status']
export type BacklinkStatus = Backlink['status']

// Department slug constants — use these instead of raw strings
export const DEPARTMENT_SLUGS = {
  SEO: 'seo' as const,
  EXECUTION: 'execution' as const,
  DESIGN: 'design' as const,
} satisfies Record<string, DepartmentSlug>

// Department IDs seeded in migration 007 — useful for server-side filtering
export const DEPARTMENT_IDS = {
  SEO: 'aaaaaaaa-0001-0001-0001-000000000001',
  EXECUTION: 'aaaaaaaa-0002-0002-0002-000000000002',
  DESIGN: 'aaaaaaaa-0003-0003-0003-000000000003',
} as const
