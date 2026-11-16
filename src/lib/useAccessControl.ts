import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export function useTaskManagerAccess() {
  const { isMaster, user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isMaster) {
      setHasAccess(true);
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    let mounted = true;

    async function load() {
      const { data } = await supabase.rpc('can_access_task_manager');
      if (mounted) {
        setHasAccess(data === true);
        setLoading(false);
      }
    }

    load();
  }, [isMaster, user]);

  return { hasAccess, loading };
}
