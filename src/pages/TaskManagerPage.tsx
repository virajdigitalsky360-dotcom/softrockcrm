import { FileBarChart } from 'lucide-react';
import { AllTasksTab } from '@/pages/MasterPanel';

export default function TaskManagerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[#17243d]">
          <FileBarChart className="h-5 w-5 text-[#1478d4]" /> Task Manager
        </h1>
        <p className="text-sm text-[#5a6c84]">View and track all tasks across workspaces</p>
      </div>
      <AllTasksTab />
    </div>
  );
}
