export type Role = 'master' | 'view_all' | 'task_manager' | 'normal';
export type TaskStatus = 'not_started' | 'started' | 'in_progress' | 'in_approval' | 'approved' | 'not_approved';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  workspace_id: string | null;
  email: string | null;
  created_at: string;
  workspace?: Workspace | null;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  name: string;
  client_id: string | null;
  team_member_id: string | null;
  workspace_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
  team_member?: TeamMember | null;
  workspace?: Workspace | null;
}

export interface TaskNote {
  id: string;
  task_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface StickyNote {
  id: string;
  user_id: string;
  content: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  team_member_id: string | null;
  created_at: string;
  team_member?: TeamMember | null;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
}

export interface PermissionRow {
  id: string;
  role_id: string;
  permission: string;
  description: string | null;
}

export interface Setting {
  id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveDayType = 'full' | 'half';

export interface Leave {
  id: string;
  employee_name: string;
  user_id: string | null;
  from_date: string;
  to_date: string;
  day_type: LeaveDayType;
  reason: string | null;
  status: LeaveStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LeaveEventType = 'created' | 'approved' | 'rejected' | 'updated';
export type LeaveEmailSendStatus = 'sent' | 'failed';

export interface LeaveEmailLog {
  id: string;
  leave_id: string | null;
  employee_name: string;
  event_type: LeaveEventType;
  recipient_email: string;
  send_status: LeaveEmailSendStatus;
  error_message: string | null;
  resend_message_id: string | null;
  created_at: string;
}

export interface EmailNotificationSetting {
  id: string;
  team_member_id: string;
  email_enabled: boolean;
  notify_pending_tasks: boolean;
  notify_leave_events: boolean;
  notify_inactivity: boolean;
  updated_at: string;
  team_member?: TeamMember | null;
}

export type AttendanceStatus = 'on_time' | 'late' | 'half_day' | 'absent' | 'leave' | 'present' | 'excused';

export interface AttendanceRecord {
  id: string;
  team_member_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  manually_overridden: boolean;
  override_reason: string | null;
  overridden_by: string | null;
  overridden_at: string | null;
  check_timestamp: string | null;
  task_count_at_check: number | null;
  task_ids_at_check: string[] | null;
  team_member_ids_checked: string[] | null;
  team_member?: TeamMember | null;
}

export interface CentralizedEmailLog {
  id: string;
  recipient_email: string;
  team_member_id: string | null;
  notification_type: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  resend_message_id: string | null;
  triggered_by: string;
  created_at: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  action: string;
  changed_at: string;
}

export interface OfficeHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AbsentSubmission {
  id: string;
  user_id: string;
  team_member_id: string | null;
  attendance_date: string;
  submission_time: string;
  reason: string;
  explanation: string | null;
  screenshot_url: string | null;
  arrival_time: string | null;
  crm_down_verified: string | null;
  verification_details: Record<string, unknown> | null;
  verification_timestamp: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  team_member?: TeamMember | null;
}
