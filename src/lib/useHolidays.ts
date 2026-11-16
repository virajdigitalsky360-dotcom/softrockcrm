import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { OfficeHoliday } from './types';

export function useHolidays() {
  const [holidays, setHolidays] = useState<OfficeHoliday[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('office_holidays')
      .select('*')
      .eq('is_active', true)
      .order('holiday_date', { ascending: true });
    if (!error && data) {
      setHolidays(data as OfficeHoliday[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('office-holidays-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_holidays' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const addHoliday = useCallback(async (date: string, name: string): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('office_holidays')
      .insert({ holiday_date: date, holiday_name: name, is_active: true });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const updateHoliday = useCallback(async (id: string, date: string, name: string): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('office_holidays')
      .update({ holiday_date: date, holiday_name: name })
      .eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const removeHoliday = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('office_holidays')
      .update({ is_active: false })
      .eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  return { holidays, loading, reload: load, addHoliday, updateHoliday, removeHoliday };
}

function isSunday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00+05:30');
  return date.getDay() === 0;
}

export function isTodaySunday(): boolean {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return isSunday(today);
}

export function getNextSundays(count: number): string[] {
  const sundays: string[] = [];
  const temp = new Date();
  for (let i = 0; i < 60 && sundays.length < count; i++) {
    const d = new Date(temp);
    d.setDate(temp.getDate() + i);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    if (d.getDay() === 0) sundays.push(dateStr);
  }
  return sundays;
}
