import { useState } from 'react';
import { LogIn, LogOut, Clock, CalendarCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useMyTodayAttendance } from '@/lib/useAttendance';
import { Card, Button } from '@/components/ui';
import type { AttendanceRecord } from '@/lib/types';

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function hoursWorked(record: AttendanceRecord | undefined): string {
  if (!record || !record.check_in || !record.check_out) return '—';
  const hours = (new Date(record.check_out).getTime() - new Date(record.check_in).getTime()) / 3600000;
  return hours >= 0 ? `${hours.toFixed(1)}h` : '—';
}

function statusLabel(status: string): { text: string; class: string } {
  switch (status) {
    case 'on_time': return { text: 'On Time', class: 'bg-sky-50 text-sky-700 border-sky-100' };
    case 'late': return { text: 'Late', class: 'bg-amber-50 text-amber-700 border-amber-100' };
    case 'half_day': return { text: 'Half Day', class: 'bg-blue-50 text-blue-700 border-blue-100' };
    case 'absent': return { text: 'Absent', class: 'bg-rose-50 text-rose-700 border-rose-100' };
    case 'leave': return { text: 'Leave', class: 'bg-sky-50 text-sky-700 border-sky-100' };
    default: return { text: status, class: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

export default function DashboardAttendance() {
  const { profile, isMaster, user } = useAuth();
  const teamMemberId = profile?.team_member_id;
  const isKapil = (user?.email ?? '').toLowerCase() === 'kapilprajapati9054@gmail.com';
  const { myRecord, loading, reload } = useMyTodayAttendance(teamMemberId);
  const [busy, setBusy] = useState(false);

  // Masters (Viraj and Kapil) don't check in/out themselves
  if (isMaster || !teamMemberId || isKapil) return null;

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  async function checkIn() {
    if (!teamMemberId) return;
    setBusy(true);
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from('attendance_records')
      .insert({ team_member_id: teamMemberId, attendance_date: today, status: 'on_time', check_in: nowISO });
    setBusy(false);
    if (!error) reload();
  }

  async function checkOut() {
    if (!myRecord) return;
    setBusy(true);
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from('attendance_records')
      .update({ check_out: nowISO })
      .eq('id', myRecord.id);
    setBusy(false);
    if (!error) reload();
  }

  const badge = myRecord ? statusLabel(myRecord.status) : null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#edf1f6] px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#17243d]">
          <CalendarCheck className="h-4 w-4 text-[#1478d4]" /> Today's Attendance
        </h2>
        <p className="mt-0.5 text-xs text-[#5a6c84]">{today} (IST)</p>
      </div>

      {loading ? (
        <div className="px-5 py-6 text-center text-xs text-[#5a6c84]">Loading...</div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#5a6c84]">Status</span>
            {badge ? (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.class}`}>{badge.text}</span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">Not checked in</span>
            )}
          </div>

          {/* IN / OUT / Hours grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#edf1f6] bg-[#fbfcfe] p-3 text-center">
              <LogIn className="mx-auto mb-1 h-4 w-4 text-[#1478d4]" />
              <p className="text-[10px] uppercase text-[#5a6c84]">IN</p>
              <p className="mt-0.5 text-sm font-semibold text-[#17243d]">{formatTime(myRecord?.check_in ?? null)}</p>
            </div>
            <div className="rounded-lg border border-[#edf1f6] bg-[#fbfcfe] p-3 text-center">
              <LogOut className="mx-auto mb-1 h-4 w-4 text-sky-500" />
              <p className="text-[10px] uppercase text-[#5a6c84]">OUT</p>
              <p className="mt-0.5 text-sm font-semibold text-[#17243d]">{formatTime(myRecord?.check_out ?? null)}</p>
            </div>
            <div className="rounded-lg border border-[#edf1f6] bg-[#fbfcfe] p-3 text-center">
              <Clock className="mx-auto mb-1 h-4 w-4 text-amber-500" />
              <p className="text-[10px] uppercase text-[#5a6c84]">Hours</p>
              <p className="mt-0.5 text-sm font-semibold text-[#17243d]">{hoursWorked(myRecord)}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {!myRecord?.check_in && (
              <Button onClick={checkIn} disabled={busy} className="flex-1">
                <LogIn className="h-4 w-4" /> Check IN
              </Button>
            )}
            {myRecord?.check_in && !myRecord?.check_out && (
              <Button onClick={checkOut} disabled={busy} className="flex-1" variant="subtle">
                <LogOut className="h-4 w-4" /> Check OUT
              </Button>
            )}
            {myRecord?.check_in && myRecord?.check_out && (
              <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-700">
                Checked out. Total: {hoursWorked(myRecord)}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
